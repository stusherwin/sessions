using System.Diagnostics;
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

        var root = Environment.CurrentDirectory;
        var dataPath = Path.Combine(root, "data");
        var filesPath = Path.Combine(root, "files");
        var sessionsFilePath = Path.Combine(dataPath, "sessions.json");

        Console.WriteLine($"Root directory: {root}");
        Console.WriteLine($"Sessions: {sessionsFilePath}");
        Console.WriteLine($"Files: {filesPath}");

        app.MapGet("/api/sessions", async () =>
        {
            var json = await File.ReadAllTextAsync(sessionsFilePath);
            var data = JsonConvert.DeserializeObject<Data>(json);
            return Results.Ok(data);
        })
        .WithName("GetSessions");

        app.MapPost("/api/sessions", async (Data data) =>
        {
            try
            {
                Console.WriteLine(data);
                await File.WriteAllTextAsync(sessionsFilePath, JsonConvert.SerializeObject(data));
                return Results.Ok();
            }
            catch(Exception ex)
            {
                return Results.InternalServerError(ex.Message);
            }
        })
        .WithName("PostSessions");

        app.MapGet("/api/session/{sessionId}/file", async (string sessionId) =>
        {
            var fileName = $"session-{sessionId}.mp3";
            var filePath = Path.Combine(filesPath, fileName);
            if(File.Exists(filePath)) {
                var stream = new FileStream(filePath, FileMode.Open);
                return Results.File(stream, "application/json", fileName);
            }
            fileName = $"session-{sessionId}.m4a";
            filePath = Path.Combine(filesPath, fileName);
            if(File.Exists(filePath)) {
                var stream = new FileStream(filePath, FileMode.Open);
                return Results.File(stream, "application/json", fileName);
            }

            return Results.NotFound($"Audio file not found for session {sessionId}");
        })
        .WithName("GetSessionFile");

        app.MapGet("/api/session/{sessionId}/peaks", async (string sessionId) =>
        {
            var filePath = Path.Combine(dataPath, $"peaks-{sessionId}.json");
            if(!File.Exists(filePath)) {
                return Results.NotFound($"Peaks file for session {sessionId} not found.");
            }

            var json = await File.ReadAllTextAsync(filePath);
            var peaks = JsonConvert.DeserializeObject<decimal[][]?>(json);
            return Results.Ok(peaks);
        })
        .WithName("GetSessionPeaks");

        app.MapPost("/api/session", async (IFormFile upload, [FromForm] string sessionName, IBackgroundTaskQueue taskQueue) =>
        {
            var json = await File.ReadAllTextAsync(sessionsFilePath);
            var sessionData = JsonConvert.DeserializeObject<Data>(json);
            if(sessionData is null)
            {
                return Results.InternalServerError("Session data file missing.");
            }

            var newSessionId = Guid.NewGuid().ToString();

            Console.WriteLine("Saving file...");
            var sourceFilePath = Path.Combine(Path.GetTempPath(), $"{Guid.NewGuid()}{Path.GetExtension(upload.FileName)}");
            using var stream = new FileStream(sourceFilePath, FileMode.Create);
            await upload.CopyToAsync(stream);

            var newSession = new Session(newSessionId, sessionName, false);
            sessionData.Sessions.Add(newSession);

            var x = JsonConvert.SerializeObject(sessionData);
            Console.WriteLine("Saving data...");
            await File.WriteAllTextAsync(sessionsFilePath, x);

            await taskQueue.QueueBackgroundWorkItemAsync(async (CancellationToken cancellationToken) =>
            {
                Console.WriteLine("Converting to mp3...");
                var newFileName = $"session-{newSessionId}.mp3";
                var mp3FilePath = Path.Combine(filesPath, newFileName);
                var ffmpeg = Process.Start("ffmpeg", $"-i {sourceFilePath} -f mp3 {mp3FilePath}");
                await ffmpeg.WaitForExitAsync();

                Console.WriteLine("Processing waveform...");
                var waveformFilePath = Path.Combine(Path.GetTempPath(), $"{Guid.NewGuid()}.json");        
                var audiowaveform = Process.Start("audiowaveform", $"-i {mp3FilePath} -o {waveformFilePath} --pixels-per-second 500 --bits 8 --input-format mp3");
                await audiowaveform.WaitForExitAsync();

                var waveformJson = await File.ReadAllTextAsync(waveformFilePath);
                var waveformData = JsonConvert.DeserializeObject<Waveform>(waveformJson);

                if(waveformData is null)
                {
                    Console.WriteLine("Could not decode audio waveform.");
                    return;
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

                var json = await File.ReadAllTextAsync(sessionsFilePath);
                var sessionData = JsonConvert.DeserializeObject<Data>(json);
                if(sessionData is null)
                {
                    Console.WriteLine("Session data file missing.");
                    return;
                }

                var session = sessionData.Sessions.FirstOrDefault(s => s.Id == newSessionId);
                if(session is null)
                {
                    Console.WriteLine($"Session with ID {newSessionId} not found.");
                    return;
                }

                var newSession = new Session(newSessionId, sessionName, true);
                sessionData?.Sessions.Remove(session);
                sessionData?.Sessions.Add(newSession);

                Console.WriteLine("Saving data...");
                await File.WriteAllTextAsync(sessionsFilePath, JsonConvert.SerializeObject(sessionData));

                Console.WriteLine("Saving peaks...");
                var filePath = Path.Combine(dataPath, $"peaks-{newSessionId}.json");                
                var peaksJson = JsonConvert.SerializeObject((decimal[][])[new_data.ToArray()]);
                await File.WriteAllTextAsync(filePath, peaksJson);
            });

            return Results.Ok(newSession);
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
}

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