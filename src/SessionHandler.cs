using System.Text.RegularExpressions;
using System.Threading.Channels;

namespace Sessions;

public class SessionHandler(Channel<TaskProgress> channel, IBackgroundTaskQueue taskQueue)
{
    public Task<Result<Data>> GetSessions() 
        => File.ReadJsonFileAsync<Data>(FileSystem.SessionsFile);

    public Task<Result<decimal[][]?>> GetSessionPeaks(string sessionId)
        => File.ReadJsonFileAsync<decimal[][]?>(FileSystem.DataFile($"peaks-{sessionId}.json"));

    public async Task<Result<FileStreamData>> StreamSessionFile(string sessionId)
    {
        var result = await File.StreamFileAsync(FileSystem.AudioFile($"session-{sessionId}.m4a"), "audio/mp4");
        if(result is NotFoundResult<FileStreamData>)
        {
            result = await File.StreamFileAsync(FileSystem.AudioFile($"session-{sessionId}.mp3"), "audio/mp3");
        }

        return result;
    }

    public Task<Result<Void>> WriteSessions(Data data)
        => File.WriteJsonFileAsync(FileSystem.SessionsFile, data);

    public async Task<Result<Session>> ProcessSessionFile(IFormFile upload, string sessionName)
    {
        var newSession = new Session(Guid.NewGuid().ToString(), sessionName, false);
        var sourceFilePath = Path.Combine(Path.GetTempPath(), $"{Guid.NewGuid()}{Path.GetExtension(upload.FileName)}");

        return await File.UploadFileAsync(upload, sourceFilePath)
            .ThenAsync(() => AddSessionAsync(newSession))
            .ThenAsync<Void, Session>(async () => 
            {
                await taskQueue.QueueBackgroundWorkItemAsync(async (CancellationToken cancellationToken) =>
                {
                    var progress = new ChannelProgress<UploadSessionProgress>(newSession.Id, 0, channel, new(null));

                    var mp3FilePath = FileSystem.AudioFile($"session-{newSession.Id}.mp3");
                    var m4aFilePath = FileSystem.AudioFile($"session-{newSession.Id}.m4a");
                    var peaksFilePath = FileSystem.DataFile($"peaks-{newSession.Id}.json");                
                    
                    await Audio.Ffmpeg(sourceFilePath, mp3FilePath, "mp3", progress.Partial(40.0))
                        .ThenAsync(() => Audio.Ffmpeg(sourceFilePath, m4aFilePath, "mp4", progress.Partial(40.0)))
                        .ThenAsync(() => Audio.AudioWaveform(mp3FilePath, progress.Partial(19.0)))
                        .ThenAsync(peaks => File.WriteJsonFileAsync(peaksFilePath, peaks))
                        .ThenAsync(() => UpdateSessionAsync(new Session(newSession.Id, newSession.Name, true, (decimal?) progress.Data.Duration)))
                        .Then(() =>
                        {
                            progress.Report(100);
                            return new OkResult();
                        });
                });

                return new OkResult<Session>(newSession);
        });
    }

    public Task<Result<Void>> ProcessSessions()
    {
        return GetSessions().ThenAsync<Data, Void>(async sessionData =>
        {
            await taskQueue.QueueBackgroundWorkItemAsync(async (CancellationToken cancellationToken) =>
            {
                Console.WriteLine($"Processing sessions...");

                var audioPattern = new Regex(@"session-([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})\.(mp3|m4a)");
                foreach(var file in Directory.GetFiles(FileSystem.Audio))
                {
                    var match = audioPattern.Match(file);
                    if(!match.Success || !sessionData.Sessions.Any(s => s.Id == match.Groups[1].Value))
                    {
                        Console.WriteLine($"Deleting file: {file}");
                        System.IO.File.Delete(file);
                    }
                }

                var peaksPattern = new Regex(@"peaks-([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})\.json");
                var sessionsPattern = new Regex("sessions.json");
                foreach(var file in Directory.GetFiles(FileSystem.Data))
                {
                    var match = peaksPattern.Match(file);
                    if(!sessionsPattern.IsMatch(file) && (!match.Success || !sessionData.Sessions.Any(s => s.Id == match.Groups[1].Value)))
                    {
                        Console.WriteLine($"Deleting file: {file}");
                        System.IO.File.Delete(file);
                    }
                }
            });

            foreach(var session in sessionData.Sessions)
            {
                Console.WriteLine($"Processing session: {session.Id}");

                string? sourceFilePath = null;
                var mp3FilePath = FileSystem.AudioFile($"session-{session.Id}.mp3");
                var m4aFilePath = FileSystem.AudioFile($"session-{session.Id}.m4a");
                var peaksFilePath = FileSystem.DataFile($"peaks-{session.Id}.json");

                if(System.IO.File.Exists(mp3FilePath) && System.IO.File.Exists(m4aFilePath) && System.IO.File.Exists(peaksFilePath))
                {
                    Console.WriteLine("Nothing to do.");
                    continue;
                } 
                else
                {
                    if(System.IO.File.Exists(mp3FilePath))
                    {
                        sourceFilePath = mp3FilePath;
                    }

                    if(System.IO.File.Exists(m4aFilePath))
                    {
                        sourceFilePath = m4aFilePath;
                    }

                    if(sourceFilePath is null)
                    {
                        Console.WriteLine("Audio file missing.");
                    }
                    else 
                    {
                        Console.WriteLine("Adding to queue for reprocessing.");
                        await taskQueue.QueueBackgroundWorkItemAsync(async (CancellationToken cancellationToken) =>
                        {
                            Console.WriteLine($"Processing session: {session.Id}");

                            var progress = new ChannelProgress<UploadSessionProgress>(session.Id, 0, channel, new(null));

                            var audioTask = !System.IO.File.Exists(mp3FilePath)
                                ? Audio.Ffmpeg(sourceFilePath, mp3FilePath, "mp3", progress.Partial(66))
                                : Audio.Ffmpeg(sourceFilePath, m4aFilePath, "mp4", progress.Partial(66));

                            await audioTask
                                .ThenAsync(() => Audio.AudioWaveform(mp3FilePath, progress.Partial(33)))
                                .ThenAsync(peaks => File.WriteJsonFileAsync(peaksFilePath, peaks))
                                .ThenAsync(() => UpdateSessionAsync(new Session(session.Id, session.Name, true, (decimal?) progress.Data.Duration)))
                                .Then(() =>
                                {
                                    progress.Report(100);
                                    return new OkResult();
                                   });                        
                        });
                    }
                }
            }

            return new OkResult();
        });
    }

    private Task<Result<Void>> AddSessionAsync(Session session)
    {
        var sessionId = session.Id;
        return GetSessions().ThenAsync(async sessionData =>
        {
            sessionData.Sessions.Add(session);
        
            return await WriteSessions(sessionData);                  
        });
    }

    private Task<Result<Void>> UpdateSessionAsync(Session session)
    {
        var sessionId = session.Id;
        return GetSessions().ThenAsync(async sessionData =>
        {
            var existingSession = sessionData.Sessions.FirstOrDefault(s => s.Id == sessionId);

            if(existingSession is null)
            {
                Console.WriteLine($"Session with ID {sessionId} not found.");
                return new ErrorResult<Void>($"Session with ID {sessionId} not found.");
            }

            sessionData.Sessions.Remove(existingSession);
            sessionData.Sessions.Add(session);
        
            return await WriteSessions(sessionData);                  
        });
    }

    private Task<Result<Void>> DeleteSessionAsync(Session session)
    {
        var sessionId = session.Id;
        return GetSessions().ThenAsync(async sessionData =>
        {
            var existingSession = sessionData.Sessions.FirstOrDefault(s => s.Id == sessionId);

            if(existingSession is not null)
            {
                sessionData.Sessions.Remove(existingSession);
            }
        
            return await WriteSessions(sessionData);                  
        });
    }
}