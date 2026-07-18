using System.Threading.Channels;

namespace Sessions;

public class SessionHandler
{
    private readonly string _dataPath;
    private readonly string _filesPath;
    private readonly string _sessionsFile;

    private readonly Channel<SessionFileProcessProgress> _channel;

    string DataFile(string fileName) => Path.Combine(_dataPath, fileName);
    string AudioFile(string fileName) => Path.Combine(_filesPath, fileName);

    public SessionHandler(string root)
    {
        _dataPath = Path.Combine(root, "data");
        _filesPath = Path.Combine(root, "files");
        _sessionsFile = DataFile("sessions.json");

        _channel = Channel.CreateUnbounded<SessionFileProcessProgress>();

        Console.WriteLine($"Root directory: {root}");
        Console.WriteLine($"Sessions: {_sessionsFile}");
        Console.WriteLine($"Files: {_filesPath}");
    }

    public Task<Result<Data>> GetSessions() 
        => File.ReadJsonFile<Data>(_sessionsFile);

    public Result<Session> GetSession(Data sessionData, string sessionId)
    {
        var session = sessionData.Sessions.FirstOrDefault(s => s.Id == sessionId);
        if(session is null)
        {
            Console.WriteLine($"Session with ID {sessionId} not found.");
            return new ErrorResult<Session>($"Session with ID {sessionId} not found.");
        }

        return new OkResult<Session>(session);
    }

    public Task<Result<decimal[][]?>> GetSessionPeaks(string sessionId)
        => File.ReadJsonFile<decimal[][]?>(DataFile($"peaks-{sessionId}.json"));

    public async Task<Result<FileStreamData>> StreamSession(string sessionId)
    {
        var result = await File.StreamFile(AudioFile($"session-{sessionId}.m4a"), "audio/mp4");
        if(result is NotFoundResult<FileStreamData>)
        {
            result = await File.StreamFile(AudioFile($"session-{sessionId}.mp3"), "audio/mp3");
        }

        return result;
    }

    public Task<Result<Void>> WriteSessions(Data data)
        => File.WriteJsonFile(_sessionsFile, data);

    public async Task<Result<Void>> WriteSessionPeaks(string sessionId, decimal[][] peaks)
    {
        var filePath = DataFile($"peaks-{sessionId}.json");                
        return await File.WriteJsonFile(filePath, peaks);
    }

    public IAsyncEnumerable<SessionFileProcessProgress> GetProgress(CancellationToken cancellationToken)
        => _channel.Reader.ReadAllAsync(cancellationToken);

    public async Task<Result<Session>> ProcessSessionFile(IFormFile upload, string sessionName, IBackgroundTaskQueue taskQueue)
    {
        var newSessionId = Guid.NewGuid().ToString();
        var sourceFilePath = Path.Combine(Path.GetTempPath(), $"{Guid.NewGuid()}{Path.GetExtension(upload.FileName)}");

        return await File.UploadFile(upload, sourceFilePath)
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
                var mp3FilePath = AudioFile($"session-{newSessionId}.mp3");
                var m4aFilePath = AudioFile($"session-{newSessionId}.m4a");
                var progress = new SessionProgress(newSessionId, null, 0, _channel);

                await taskQueue.QueueBackgroundWorkItemAsync(async (CancellationToken cancellationToken) =>
                {
                    await Audio.Ffmpeg(sourceFilePath, mp3FilePath, "mp3", progress.Partial(40.0))
                        .ThenAsync(() => Audio.Ffmpeg(sourceFilePath, m4aFilePath, "mp4", progress.Partial(40.0)))
                        .ThenAsync(() => Audio.AudioWaveform(mp3FilePath, progress.Partial(19.0)))
                        .ThenAsync(peaks => WriteSessionPeaks(newSessionId, peaks))
                        .ThenAsync(GetSessions)
                        .Then(sessionData => GetSession(sessionData, newSessionId)
                            .Map(session => (sessionData, session)))
                        .ThenAsync(async r => 
                        {
                            var newSession = new Session(newSessionId, sessionName, true, (decimal?) progress.Duration);
                            r.sessionData.Sessions.Remove(r.session);
                            r.sessionData.Sessions.Add(newSession);
                            
                            return await WriteSessions(r.sessionData);
                        }).Then(() =>
                        {
                            progress.UpdateProgress(100);
                            return new OkResult();
                        });
                });
                
                return new OkResult<Session>(newSession);
        });
    }
}