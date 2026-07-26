using System.Threading.Channels;

namespace Sessions;

public class SessionHandler
{
    private readonly Channel<TaskProgress> _channel;

    public SessionHandler(Channel<TaskProgress> channel)
    {
        _channel = channel;
    }

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

    public async Task<Result<Void>> WriteSessionPeaks(string sessionId, decimal[][] peaks)
    {
        var filePath = FileSystem.DataFile($"peaks-{sessionId}.json");                
        return await File.WriteJsonFileAsync(filePath, peaks);
    }

    public async Task<Result<Session>> ProcessSessionFile(IFormFile upload, string sessionName, IBackgroundTaskQueue taskQueue)
    {
        var newSessionId = Guid.NewGuid().ToString();
        var sourceFilePath = Path.Combine(Path.GetTempPath(), $"{Guid.NewGuid()}{Path.GetExtension(upload.FileName)}");

        return await File.UploadFileAsync(upload, sourceFilePath)
            .ThenAsync(GetSessions)
            .ThenAsync(async sessionData => 
            {
                var newSession = new Session(newSessionId, sessionName, false);
                sessionData.Sessions.Add(newSession);

                return await WriteSessions(sessionData)
                    .Map(() => newSession);
            })
            .ThenAsync<Session, Session>(async newSession => 
            {
                var mp3FilePath = FileSystem.AudioFile($"session-{newSessionId}.mp3");
                var m4aFilePath = FileSystem.AudioFile($"session-{newSessionId}.m4a");
                var progress = new ChannelProgress<UploadSessionProgress>(newSessionId, 0, _channel, new(null));

                await taskQueue.QueueBackgroundWorkItemAsync(async (CancellationToken cancellationToken) =>
                {
                    await Audio.Ffmpeg(sourceFilePath, mp3FilePath, "mp3", progress.Partial(40.0))
                        .ThenAsync(() => Audio.Ffmpeg(sourceFilePath, m4aFilePath, "mp4", progress.Partial(40.0)))
                        .ThenAsync(() => Audio.AudioWaveform(mp3FilePath, progress.Partial(19.0)))
                        .ThenAsync(peaks => WriteSessionPeaks(newSessionId, peaks))
                        .ThenAsync(() => UpdateSessionAsync(new Session(newSessionId, sessionName, true, (decimal?) progress.Data.Duration)))
                        .Then(() =>
                        {
                            progress.Report(100);
                            return new OkResult();
                        });
                });
                
                return new OkResult<Session>(newSession);
        });
    }

    private Task<Result<Session>> FindSessionAsync(string sessionId)
    {
        return GetSessions().Then<Data, Session>(sessionData =>
        {
            var session = sessionData.Sessions.FirstOrDefault(s => s.Id == sessionId);
            if(session is null)
            {
                Console.WriteLine($"Session with ID {sessionId} not found.");
                return new ErrorResult<Session>($"Session with ID {sessionId} not found.");
            }

            return new OkResult<Session>(session);                    
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
}