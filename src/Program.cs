using System.Diagnostics;
using System.Text.RegularExpressions;
using System.Threading.Channels;
using Microsoft.AspNetCore.Http.Features;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.SpaServices.ReactDevelopmentServer;
using Newtonsoft.Json;

namespace Sessions;

public class Program 
{
    public static void Main(string[] args)
    {
        var builder = WebApplication.CreateBuilder(args);
        var services = builder.Services;

        services.AddRazorPages();
        services.AddOpenApi();
        services.AddAntiforgery();
        services.AddHostedService<QueuedHostedService>();
        services.AddSingleton<IBackgroundTaskQueue>(ctx =>
            new BackgroundTaskQueue(100));

        const int MaxRequestSizeBytes = 1 * 1024 * 1024 * 1024;
        services.Configure<FormOptions>(x => {
            x.ValueLengthLimit = MaxRequestSizeBytes;
            x.MultipartBodyLengthLimit = MaxRequestSizeBytes;
        });
        builder.WebHost.ConfigureKestrel(o => o.Limits.MaxRequestBodySize = MaxRequestSizeBytes);

        var app = builder.Build();

        if (app.Environment.IsDevelopment())
        {
            app.MapOpenApi();
        }

        app.UseHttpsRedirection();
        app.UseAntiforgery();
        app.MapRazorPages();

        var root = Directory.GetParent(Environment.CurrentDirectory)!.FullName;
        var dataPath = Path.Combine(root, "data");
        var filesPath = Path.Combine(root, "files");

        string DataFile(string fileName) => Path.Combine(dataPath, fileName);
        string AudioFile(string fileName) => Path.Combine(filesPath, fileName);
        var sessionsFile = Path.Combine(dataPath, "sessions.json");

        var channel = Channel.CreateUnbounded<SessionFileProcessProgress>();

        Console.WriteLine($"Root directory: {root}");
        Console.WriteLine($"Sessions: {sessionsFile}");
        Console.WriteLine($"Files: {filesPath}");

        app.MapGet("/api/sessions", async () => {
            var result = await ReadJsonFile<Data>(sessionsFile);
            return result.Http();
        })
        .WithName("GetSessions");
        
        app.MapPost("/api/sessions", async (Data data) =>
        {
            var result = await WriteJsonFile(sessionsFile, data);
            return result.Http();
        })
        .WithName("PostSessions");

        app.MapGet("/api/session/{sessionId}/file", async (string sessionId) =>
        {
            var result = await StreamFile(AudioFile($"session-{sessionId}.m4a"), "audio/mp4");
            if(result is NotFoundResult<FileStreamData>)
            {
                result = await StreamFile(AudioFile($"session-{sessionId}.mp3"), "audio/mp3");
            }

            return result.Http();
        })
        .WithName("GetSessionFile");

        app.MapGet("/api/session/{sessionId}/peaks", async (string sessionId) =>
        {
            var result = await ReadJsonFile<decimal[][]?>(DataFile($"peaks-{sessionId}.json"));
            return result.Http();
        })
        .WithName("GetSessionPeaks");

        app.MapGet("api/sessions/progress", (
            CancellationToken cancellationToken) =>
        {
            // 1. ReadAllAsync returns an IAsyncEnumerable
            // 2. Results.ServerSentEvents tells the browser: "Keep this connection open"
            // 3. New data is pushed to the client as soon as it enters the channel
            return Results.ServerSentEvents(
                channel.Reader.ReadAllAsync(cancellationToken),
                eventType: "session-progress");
        });

        app.MapPost("/api/session", async (IFormFile upload, [FromForm] string sessionName, IBackgroundTaskQueue taskQueue) =>
        {
            var newSessionId = Guid.NewGuid().ToString();
            var sourceFilePath = Path.Combine(Path.GetTempPath(), $"{Guid.NewGuid()}{Path.GetExtension(upload.FileName)}");
            var newSession = new Session(newSessionId, sessionName, false);

            return await ReadJsonFile<Data>(sessionsFile)
                .Then(async sessionData => 
                {
                    Console.WriteLine($"Saving file {sourceFilePath}");
                    using var stream = new FileStream(sourceFilePath, FileMode.Create);
                    await upload.CopyToAsync(stream);

                    sessionData.Sessions.Add(newSession);

                    return await WriteJsonFile(sessionsFile, sessionData)
                        .Map(_ => newSession);
                })
                .Then<Session, Session>(async _ => 
                {
                    await taskQueue.QueueBackgroundWorkItemAsync(async (CancellationToken cancellationToken) =>
                    {
                        var mp3FilePath = Path.Combine(filesPath, $"session-{newSessionId}.mp3");
                        var m4aFilePath = Path.Combine(filesPath, $"session-{newSessionId}.m4a");

                        await ConvertToMp3(newSessionId, sourceFilePath, mp3FilePath, channel)
                        .Then(r => ConvertToMp4(newSessionId, sourceFilePath, m4aFilePath, r.Duration, r.Progress, channel)
                            .Map(progress => (r.Item1, progress)))
                        .Then(r => ProcessWaveform(newSessionId, mp3FilePath, r.Item2, channel)
                            .Map(new_data => (r.Item1, new_data)))
                        .Then(async r =>
                        {
                            var filePath = Path.Combine(dataPath, $"peaks-{newSessionId}.json");                
                            return await WriteJsonFile<decimal[][]>(filePath, [r.Item2.ToArray()])
                                .Map(_ => r.Item1);
                        })
                        .Then(duration => ReadJsonFile<Data>(sessionsFile)
                            .Map(new_data => (duration, new_data)))
                        .Then(async r =>
                        {
                            var sessionData = r.Item2;
                            var session = sessionData.Sessions.FirstOrDefault(s => s.Id == newSessionId);
                            if(session is null)
                            {
                                Console.WriteLine($"Session with ID {newSessionId} not found.");
                                return new ErrorResult<Void>($"Session with ID {newSessionId} not found.");
                            }

                            var newSession = new Session(newSessionId, sessionName, true, (decimal?) r.Item1);
                            sessionData?.Sessions.Remove(session);
                            sessionData?.Sessions.Add(newSession);
                            
                            return await WriteJsonFile(sessionsFile, sessionData);
                        }).Then(_ =>
                        {
                            channel.Writer.TryWrite(new(newSessionId, 100));
                            return new OkResult();
                        });
                    });
                    
                    return new OkResult<Session>(newSession);
            })
            .Http();
        })
        .WithName("PostFile");

        app.UseStaticFiles();

        if(app.Environment.IsDevelopment())
        {
            app.UseWhen(
                context => context.Request.Path.StartsWithSegments("/dist"),
                then => then.UseSpa(spa =>
                {
                    const int port = 5174;

                    spa.Options.SourcePath = "client";
                    spa.Options.DevServerPort = port;
                    spa.UseReactDevelopmentServer(npmScript: "start");
                    spa.UseProxyToSpaDevelopmentServer($"http://localhost:{port}");
                }));
        }

        app.Run();
    }

    static async Task<Result<FileStreamData>> StreamFile(string filePath, string contentType)
    {
        if(!File.Exists(filePath))
        {
            return new NotFoundResult<FileStreamData>($"File not found: {filePath}");
        }

        var fileName = Path.GetFileName(filePath);

        var stream = new FileStream(filePath, FileMode.Open);
        return new FileStreamResult(stream, "audio/mp4", fileName);
    }

    static async Task<Result<T>> ReadJsonFile<T>(string filePath)
    {
        if(!File.Exists(filePath))
        {
            return new NotFoundResult<T>($"File not found: {filePath}");
        }

        var json = await File.ReadAllTextAsync(filePath);
        
        try
        {
            var data = JsonConvert.DeserializeObject<T>(json);
            if(data is null)
            {
                return new ErrorResult<T>("File data deserialized to null");
            }
            return new OkResult<T>(data);
        }
        catch(JsonException ex)
        {
            return new ErrorResult<T>(ex.Message);
        }
    }

    static async Task<Result<Void>> WriteJsonFile<T>(string filePath, T data)
    {
        try
        {
            await File.WriteAllTextAsync(filePath, JsonConvert.SerializeObject(data));
            return new OkResult();
        }
        catch(Exception ex)
        {
            return new ErrorResult<Void>(ex.Message);
        }
    }

    static async Task<Result<(double? Duration, int Progress)>> ConvertToMp3(string newSessionId, string sourceFilePath, string mp3FilePath, Channel<SessionFileProcessProgress> channel)
    {
        Console.WriteLine("Converting to mp3...");
        int progress = 0;
        double? Duration = null;
        using(var ffmpeg = new Process())
        { 
            ffmpeg.StartInfo.FileName = "ffmpeg";
            ffmpeg.StartInfo.Arguments = $"-i {sourceFilePath} -f mp3 {mp3FilePath}";
            ffmpeg.StartInfo.UseShellExecute = false;
            ffmpeg.StartInfo.CreateNoWindow = true;
            ffmpeg.StartInfo.RedirectStandardOutput = true;
            ffmpeg.StartInfo.RedirectStandardError = true;

            ffmpeg.EnableRaisingEvents = true;
            var exited = new TaskCompletionSource<bool>();
            ffmpeg.Exited += (o, e) => exited.TrySetResult(true);

            DataReceivedEventHandler handler = (o, e) =>
            {
                if(e.Data is null)
                {
                    return;
                }

                var duration = new Regex(@"Duration: (\d\d):(\d\d):(\d\d).(\d\d)").Match(e.Data);
                if(duration.Success)
                {
                    var h = int.Parse(duration.Groups[1].Value);
                    var m = int.Parse(duration.Groups[2].Value);
                    var s = int.Parse(duration.Groups[3].Value);
                    var ms = int.Parse(duration.Groups[4].Value);
                    Duration = new TimeSpan(0, h, m, s, ms).TotalSeconds;
                }                

                var time = new Regex(@"time=(\d\d):(\d\d):(\d\d).(\d\d)").Match(e.Data);
                if(time.Success)
                {
                    var h = int.Parse(time.Groups[1].Value);
                    var m = int.Parse(time.Groups[2].Value);
                    var s = int.Parse(time.Groups[3].Value);
                    var ms = int.Parse(time.Groups[4].Value);
                    var t = new TimeSpan(0, h, m, s, ms).TotalSeconds;
                    if(Duration.HasValue) {
                        var p = (int)((t / Duration) * 40.0);
                        if(p > progress) {
                            progress = p;
                            channel.Writer.TryWrite(new(newSessionId, progress));
                            Console.WriteLine($"{progress}%");
                        }
                    }
                }
            };
            ffmpeg.OutputDataReceived += handler;
            ffmpeg.ErrorDataReceived += handler;
            ffmpeg.Start();
            ffmpeg.BeginOutputReadLine();
            ffmpeg.BeginErrorReadLine();
            await exited.Task;

            return new OkResult<(double?, int)>((Duration, progress));
        }
    }

    static async Task<Result<int>> ConvertToMp4(string newSessionId, string sourceFilePath, string m4aFilePath, double? Duration, int progress, Channel<SessionFileProcessProgress> channel)
    {
        Console.WriteLine("Converting to mp4...");
        using(var ffmpeg = new Process())
        { 
            ffmpeg.StartInfo.FileName = "ffmpeg";
            ffmpeg.StartInfo.Arguments = $"-i {sourceFilePath} -f mp4 {m4aFilePath}";
            ffmpeg.StartInfo.UseShellExecute = false;
            ffmpeg.StartInfo.CreateNoWindow = true;
            ffmpeg.StartInfo.RedirectStandardOutput = true;
            ffmpeg.StartInfo.RedirectStandardError = true;

            ffmpeg.EnableRaisingEvents = true;
            var exited = new TaskCompletionSource<bool>();
            ffmpeg.Exited += (o, e) => exited.TrySetResult(true);

            DataReceivedEventHandler handler = (o, e) =>
            {
                if(e.Data is null)
                {
                    return;
                }

                var time = new Regex(@"time=(\d\d):(\d\d):(\d\d).(\d\d)").Match(e.Data);
                if(time.Success)
                {
                    var h = int.Parse(time.Groups[1].Value);
                    var m = int.Parse(time.Groups[2].Value);
                    var s = int.Parse(time.Groups[3].Value);
                    var ms = int.Parse(time.Groups[4].Value);
                    var t = new TimeSpan(0, h, m, s, ms).TotalSeconds;
                    if(Duration.HasValue) {
                        var p = (int)((t / Duration) * 40.0 + 40.0);
                        if(p > progress) {
                            progress = p;
                            channel.Writer.TryWrite(new(newSessionId, progress));
                            Console.WriteLine($"{progress}%");
                        }
                    }
                }
            };

            ffmpeg.OutputDataReceived += handler;
            ffmpeg.ErrorDataReceived += handler;
            ffmpeg.Start();
            ffmpeg.BeginOutputReadLine();
            ffmpeg.BeginErrorReadLine();
            await exited.Task;

            return new OkResult<int>(progress);
        }
    }

    static async Task<Result<List<decimal>>> ProcessWaveform(string newSessionId, string mp3FilePath, int progress, Channel<SessionFileProcessProgress> channel)
    {
        Console.WriteLine("Processing waveform...");
        var waveformFilePath = Path.Combine(Path.GetTempPath(), $"{Guid.NewGuid()}.json");        
        using(var audiowaveform = new Process())
        {
            audiowaveform.StartInfo.FileName = "audiowaveform";
            audiowaveform.StartInfo.Arguments = $"-i {mp3FilePath} -o {waveformFilePath} --pixels-per-second 20 --bits 8 --input-format mp3";
            audiowaveform.StartInfo.UseShellExecute = false;
            audiowaveform.StartInfo.CreateNoWindow = true;
            audiowaveform.StartInfo.RedirectStandardOutput = true;
            audiowaveform.StartInfo.RedirectStandardError = true;
            DataReceivedEventHandler handler = (o, e) =>
            {
                if(e.Data is null)
                {
                    return;
                }

                var done = new Regex(@"Done: (\d+)%").Match(e.Data);
                if(done.Success)
                {
                    var p = (int)((double.Parse(done.Groups[1].Value) / 100.0) * 19.0 + 80.0);
                    if(p > progress) {
                        progress = p;
                        channel.Writer.TryWrite(new(newSessionId, progress));
                        Console.WriteLine($"{progress}%");
                    }
                }
            };
            var exited = new TaskCompletionSource<bool>();
            audiowaveform.EnableRaisingEvents = true;
            audiowaveform.Exited += (o, e) => exited.TrySetResult(true);
            audiowaveform.ErrorDataReceived += handler;
            audiowaveform.OutputDataReceived += handler;
            audiowaveform.Start();
            audiowaveform.BeginErrorReadLine();
            audiowaveform.BeginOutputReadLine();
            await exited.Task;
        }

        var waveformJson = await File.ReadAllTextAsync(waveformFilePath);
        var waveformData = JsonConvert.DeserializeObject<Waveform>(waveformJson);

        if(waveformData is null)
        {
            Console.WriteLine("Could not decode audio waveform.");
            return new ErrorResult<List<decimal>>("Could not decode audio waveform.");
        }

        var data = waveformData.Data;
        var channels = waveformData.Channels;
        // number of decimals to use when rounding the peak value
        var digits = 2;

        var max_val = data.Max();
        var new_data = new List<decimal>();
        foreach(var x in data)
        {
            new_data.Add(Math.Round(x / max_val, digits));
        }
        
        // audiowaveform is generating interleaved peak data when using the --split-channels flag, so we have to deinterleave it
        // if(channels > 1) {
        //     new_data = Deinterleave(new_data, channels);
        // }

        // decimal[][] Deinterleave(List<decimal> data, int channelCount) {
        //     // first step is to separate the values for each audio channel and min/max value pair, hence we get an array with channelCount * 2 arrays
        //     var deinterleaved = [data[idx::channelCount * 2] for idx in range(channelCount * 2)]
        //     new_data = []

        //     // this second step combines each min and max value again in one array so we have one array for each channel
        //     for(var ch = 0; ch < channelCount; ch++) {
        //         var idx1 = 2 * ch;
        //         var idx2 = 2 * ch + 1;
        //         ch_data = [None] * (len(deinterleaved[idx1]) + len(deinterleaved[idx2]))
        //         ch_data[::2] = deinterleaved[idx1]
        //         ch_data[1::2] = deinterleaved[idx2]
        //         new_data.append(ch_data)
        //     }
        //     return new_data
        // }

        return new OkResult<List<decimal>>(new_data);
    }
}

public abstract record Result<T>
{
    public abstract IResult Http();
    public abstract Result<U> Map<U>(Func<T, U> func);
    public abstract Result<U> Then<U>(Func<T, Result<U>> func);
    public abstract Task<Result<U>> Then<U>(Func<T, Task<Result<U>>> func);
}

public record NotFoundResult<T>(string Message) : Result<T>
{
    public override IResult Http() => Results.NotFound(Message);
    
    public override Result<U> Map<U>(Func<T, U> func)
        => new NotFoundResult<U>(Message);
    
    public override Result<U> Then<U>(Func<T, Result<U>> func) 
        => new NotFoundResult<U>(Message);
    
    public override Task<Result<U>> Then<U>(Func<T, Task<Result<U>>> func) 
        => Task.FromResult<Result<U>>(new NotFoundResult<U>(Message));
}

public record ErrorResult<T>(string Message) : Result<T>
{
    public override IResult Http() => Results.InternalServerError(Message);

    public override Result<U> Map<U>(Func<T, U> func)
        => new ErrorResult<U>(Message);
    
    public override Result<U> Then<U>(Func<T, Result<U>> func) 
        => new ErrorResult<U>(Message);

    public override Task<Result<U>> Then<U>(Func<T, Task<Result<U>>> func)
        => Task.FromResult<Result<U>>(new ErrorResult<U>(Message));
}

public record OkResult<T>(T Value) : Result<T>
{
    public override IResult Http() => Value switch {
        Void => Results.Ok(),
        FileStreamData fs => Results.File(fs.Stream, fs.ContentType, fs.FileName),
        _ => Results.Ok(Value)
    };

    public override Result<U> Map<U>(Func<T, U> func)
        => new OkResult<U>(func(Value));
    
    public override Result<U> Then<U>(Func<T, Result<U>> func) 
        => func(Value);

    public override async Task<Result<U>> Then<U>(Func<T, Task<Result<U>>> func) 
    {
        var result = await func(Value);
        return result;
    }
}

public record OkResult() : OkResult<Void>(new Void());

public record FileStreamResult(FileStream Stream, string ContentType, string FileName) 
    : OkResult<FileStreamData>(new FileStreamData(Stream, ContentType, FileName));

public record Void();
public record FileStreamData(FileStream Stream, string ContentType, string FileName);

record Data(
    List<Session> Sessions, 
    List<Tune> Tunes, 
    List<Performance> Performances);

record Session(
    string Id, 
    string Name, 
    bool Processed,
    decimal? Duration = null);

record Tune(
    string Id, 
    string Name);

record Performance(
    string Id, 
    string TuneId, 
    string TuneName, 
    string SessionId, 
    string SessionName, 
    decimal StartTime, 
    decimal EndTime);

record Waveform(
    decimal Version,
    int Channels,
    [JsonProperty("sample_rate")]
    int SampleRate,
    [JsonProperty("samples_per_pixel")]
    int SamplesPerPixel,
    int Bits,
    int Length,
    decimal[] Data);

record SessionFileProcessProgress(string sessionId, int progress);

public static class ResultTaskExtensions
{
    public static async Task<IResult> Http<T>(this Task<Result<T>> resultTask)
    {
        var result = await resultTask;

        return result.Http();
    }

    public static async Task<Result<U>> Then<T, U>(this Task<Result<T>> resultTask, Func<T, Task<Result<U>>> func)
    {
        var result = await resultTask;
        var thenResult = await result.Then(func);

        return thenResult;
    }

    public static async Task<Result<U>> Then<T, U>(this Task<Result<T>> resultTask, Func<T, Result<U>> func)
    {
        var result = await resultTask;
        var thenResult = result.Then(func);

        return thenResult;
    }

    public static async Task<Result<U>> Map<T, U>(this Task<Result<T>> resultTask, Func<T, U> func)
    {
        var result = await resultTask;

        return result.Map(func);
    }
}