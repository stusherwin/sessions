using System.IO.Compression;
using System.Text.RegularExpressions;
using System.Threading.Channels;

namespace Sessions;

public class SessionHandler
{
    private readonly string _filesPath;
    private readonly string _backupsPath;
    private readonly string _dataPath;
    private readonly string _audioPath;
    private readonly string _sessionsFile;

    private readonly Channel<TaskProgress> _channel;

    string DataFile(string fileName) => Path.Combine(_dataPath, fileName);
    string AudioFile(string fileName) => Path.Combine(_audioPath, fileName);
    string BackupFile(string fileName) => Path.Combine(_backupsPath, fileName);

    public SessionHandler(string root)
    {
        _filesPath = Path.Combine(root, "files");
        _dataPath = Path.Combine(_filesPath, "data");
        _audioPath = Path.Combine(_filesPath, "audio");
        _sessionsFile = DataFile("sessions.json");
        _backupsPath = Path.Combine(root, "backup");

        _channel = Channel.CreateUnbounded<TaskProgress>();

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

    public async Task<Result<FileStreamData>> StreamSessionFile(string sessionId)
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

    public IAsyncEnumerable<TaskProgress> GetProgress(CancellationToken cancellationToken)
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
                var progress = new ChannelProgress<UploadSessionProgress>(newSessionId, 0, _channel, new(null));

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
                            var newSession = new Session(newSessionId, sessionName, true, (decimal?) progress.Data.Duration);
                            r.sessionData.Sessions.Remove(r.session);
                            r.sessionData.Sessions.Add(newSession);
                            
                            return await WriteSessions(r.sessionData);
                        }).Then(() =>
                        {
                            progress.Report(100);
                            return new OkResult();
                        });
                });
                
                return new OkResult<Session>(newSession);
        });
    }

    public async Task<Result<Backup[]>> GetBackups()
    {
        var filenamePattern = new Regex(@"([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})-(\d{4})-(\d{2})-(\d{2})-(\d{2})-(\d{2})-(\d{2})");
        var backups = Directory.GetFiles(_backupsPath)
            .SelectMany<string, Backup>(f => 
            {
                var match = filenamePattern.Match(f);
                if(!match.Success)
                {
                    return [];
                }

                var id = match.Groups[1].Value;
                var date = new DateTime(
                    int.Parse(match.Groups[2].Value),
                    int.Parse(match.Groups[3].Value),
                    int.Parse(match.Groups[4].Value),
                    int.Parse(match.Groups[5].Value),
                    int.Parse(match.Groups[6].Value),
                    int.Parse(match.Groups[7].Value));
                var size = new FileInfo(f).Length / 1024.0 / 1024.0;

                return [new Backup(id, date, size, f, true)];
            })
            .ToArray();
        
        return new OkResult<Backup[]>(backups);
    }

    public async Task<Result<string>> CreateBackup()
    {
        var id = Guid.NewGuid().ToString();
        var date = DateTime.Now.ToString("yyyy-MM-dd-HH-mm-ss");
        var zipFilePath = BackupFile($"{id}-{date}.bak");

        await ZipFile.CreateFromDirectoryAsync(_filesPath, zipFilePath);

        return new OkResult<string>(id);
    }

    public async Task<Result<FileStreamData>> StreamBackupFile(string backupId)
    {
        var filenamePattern = new Regex(@"([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})-(\d{4})-(\d{2})-(\d{2})-(\d{2})-(\d{2})-(\d{2})");
        var backup = Directory.GetFiles(_backupsPath)
            .SelectMany<string, Backup>(f => 
            {
                var match = filenamePattern.Match(f);
                if(!match.Success)
                {
                    return [];
                }

                var id = match.Groups[1].Value;
                var date = new DateTime(
                    int.Parse(match.Groups[2].Value),
                    int.Parse(match.Groups[3].Value),
                    int.Parse(match.Groups[4].Value),
                    int.Parse(match.Groups[5].Value),
                    int.Parse(match.Groups[6].Value),
                    int.Parse(match.Groups[7].Value));
                var size = new FileInfo(f).Length / 1024.0 / 1024.0;

                return [new Backup(id, date, size, f, true)];
            })
            .FirstOrDefault(b => b.Id == backupId);

        if(backup is null)
        {
            return new NotFoundResult<FileStreamData>($"Could not find backup with Id: {backupId}");
        }

        var result = await File.StreamFile(backup.FilePath, "application/zip", $"sessions-{backup.Date}.bak");

        return result;
    }

    public async Task<Result<Backup>> ProcessBackupFile(IFormFile upload, IBackgroundTaskQueue taskQueue)
    {
        var backupId = Guid.NewGuid().ToString();
        var date = DateTime.Now;
        var backupFilePath = BackupFile($"{backupId}-{date.ToString("yyyy-MM-dd-HH-mm-ss")}.bak");
        var backup = new Backup(backupId, date, upload.Length / 1024.0 / 1024.0, backupFilePath, false);
        var sourceFilePath = Path.Combine(Path.GetTempPath(), $"{backupId}{Path.GetExtension(upload.FileName)}");

        return await File.UploadFile(upload, sourceFilePath)
            .ThenAsync<Void, Backup>(async () => 
            {
                await taskQueue.QueueBackgroundWorkItemAsync(async (CancellationToken cancellationToken) =>
                {
                    var progress = new ChannelProgress<BackupProgress>(backupId, 0, _channel, new());

                    ZipFileWithProgress.CreateFromDirectory(_filesPath, backupFilePath, progress.Partial(45));

                    var fileDeleteProgress = progress.Partial(10);
                    var dataFiles = Directory.GetFiles(_dataPath);
                    var audioFiles = Directory.GetFiles(_audioPath);
                    var total = dataFiles.Length + audioFiles.Length + 1;
                    int i = 0;
                    foreach(var file in dataFiles)
                    {
                        System.IO.File.Delete(file);
                        i++;
                        fileDeleteProgress.Report(i / total);
                    }
                    foreach(var file in audioFiles)
                    {
                        System.IO.File.Delete(file);
                        i++;
                        fileDeleteProgress.Report(i / total);
                    }
                    fileDeleteProgress.Report(100);

                    ZipFileWithProgress.ExtractToDirectory(sourceFilePath, _filesPath, progress.Partial(45));
                    progress.Report(100);
                });
            
                return new OkResult<Backup>(backup);
            });
    }

    public async Task<Result<Void>> RestoreBackup(string backupId, IBackgroundTaskQueue taskQueue)
    {
        var filenamePattern = new Regex(@"([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})-(\d{4})-(\d{2})-(\d{2})-(\d{2})-(\d{2})-(\d{2})");
        var backup = Directory.GetFiles(_backupsPath)
            .SelectMany<string, Backup>(f => 
            {
                var match = filenamePattern.Match(f);
                if(!match.Success)
                {
                    return [];
                }

                var id = match.Groups[1].Value;
                var date = new DateTime(
                    int.Parse(match.Groups[2].Value),
                    int.Parse(match.Groups[3].Value),
                    int.Parse(match.Groups[4].Value),
                    int.Parse(match.Groups[5].Value),
                    int.Parse(match.Groups[6].Value),
                    int.Parse(match.Groups[7].Value));
                var size = new FileInfo(f).Length / 1024.0 / 1024.0;

                return [new Backup(id, date, size, f, true)];
            })
            .FirstOrDefault(b => b.Id == backupId);

        if(backup is null)
        {
            return new NotFoundResult<Void>($"Could not find backup with Id: {backupId}");
        }

        await taskQueue.QueueBackgroundWorkItemAsync(async (CancellationToken cancellationToken) =>
        {
            var progress = new ChannelProgress<BackupProgress>(backupId, 0, _channel, new());

            var fileDeleteProgress = progress.Partial(10);
            var dataFiles = Directory.GetFiles(_dataPath);
            var audioFiles = Directory.GetFiles(_audioPath);
            var total = dataFiles.Length + audioFiles.Length + 1;
            int i = 0;
            foreach(var file in dataFiles)
            {
                System.IO.File.Delete(file);
                i++;
                fileDeleteProgress.Report(i / total);
            }
            foreach(var file in audioFiles)
            {
                System.IO.File.Delete(file);
                i++;
                fileDeleteProgress.Report(i / total);
            }
            fileDeleteProgress.Report(100);

            ZipFileWithProgress.ExtractToDirectory(backup.FilePath, _filesPath, progress.Partial(90));
            progress.Report(100);
        });
    
        return new OkResult();
    }
}