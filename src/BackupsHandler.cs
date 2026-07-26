using System.Text.RegularExpressions;
using System.Threading.Channels;

namespace Sessions;

public class BackupsHandler
{
    private readonly Channel<TaskProgress> _channel;

    public BackupsHandler(Channel<TaskProgress> channel)
    {
        _channel = channel;
    }

    public async Task<Result<Backup[]>> GetBackups()
    {
        var backups = GetAllBackups();
        
        return new OkResult<Backup[]>(backups);
    }

    public async Task<Result<Backup>> CreateBackup(IBackgroundTaskQueue taskQueue)
    {
        var backup = CreateBackup();

        await taskQueue.QueueBackgroundWorkItemAsync(async (CancellationToken cancellationToken) =>
        {
            var progress = new ChannelProgress<BackupProgress>(backup.Id, 0, _channel, new());

            ZipFileWithProgress.CreateFromDirectory(FileSystem.Files, backup.FilePath, progress);
            progress.Report(100);
        });

        return new OkResult<Backup>(backup);
    }

    public Task<Result<FileStreamData>> StreamBackupFile(string backupId)
    {
        return FindBackup(backupId)
            .ThenAsync(backup => File.StreamFileAsync(backup.FilePath, "application/zip", $"sessions-{backup.Date}.bak"));
    }

    public Task<Result<Backup>> ProcessBackupFile(IFormFile upload, IBackgroundTaskQueue taskQueue)
    {        
        var backup = CreateBackup(upload);
        var sourceFilePath = Path.Combine(Path.GetTempPath(), $"{backup.Id}{Path.GetExtension(upload.FileName)}");

        return File.UploadFileAsync(upload, sourceFilePath)
            .ThenAsync<Void, Backup>(async () => 
            {
                await taskQueue.QueueBackgroundWorkItemAsync(async (CancellationToken cancellationToken) =>
                {
                    var progress = new ChannelProgress<BackupProgress>(backup.Id, 0, _channel, new());

                    ZipFileWithProgress.CreateFromDirectory(FileSystem.Files, backup.FilePath, progress.Partial(45));
                    ClearFiles(progress.Partial(10));
                    ZipFileWithProgress.ExtractToDirectory(sourceFilePath, FileSystem.Files, progress.Partial(45));
                    progress.Report(100);
                });
            
                return new OkResult<Backup>(backup);
            });
    }

    public Task<Result<Void>> RestoreBackup(string backupId, IBackgroundTaskQueue taskQueue)
    {
        return FindBackup(backupId)
            .ThenAsync<Void>(async backup =>
            {
                await taskQueue.QueueBackgroundWorkItemAsync(async (CancellationToken cancellationToken) =>
                {
                    var progress = new ChannelProgress<BackupProgress>(backupId, 0, _channel, new());

                    ClearFiles(progress.Partial(10));
                    ZipFileWithProgress.ExtractToDirectory(backup.FilePath, FileSystem.Files, progress.Partial(90));
                    progress.Report(100);
                });
               
                return new OkResult();
            });
    }

    private Backup[] GetAllBackups()
    {
        var filenamePattern = new Regex(@"([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})-(\d{4})-(\d{2})-(\d{2})-(\d{2})-(\d{2})-(\d{2})");
        var backups = Directory.GetFiles(FileSystem.Backups)
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

                return [new Backup(id, date, f, true, size)];
            })
            .ToArray();    

        return backups;    
    }

    private Result<Backup> FindBackup(string backupId)
    {
        var backup = GetAllBackups().FirstOrDefault(b => b.Id == backupId);

        if(backup is null)
        {
            return new NotFoundResult<Backup>($"Could not find backup with Id: {backupId}");
        }

        return new OkResult<Backup>(backup);
    }

    private void ClearFiles(ISessionsProgress<BackupProgress> progress)
    {
        var dataFiles = Directory.GetFiles(FileSystem.Data);
        var audioFiles = Directory.GetFiles(FileSystem.Audio);
        var total = dataFiles.Length + audioFiles.Length + 1;
        int i = 0;
        foreach(var file in dataFiles)
        {
            System.IO.File.Delete(file);
            i++;
            progress.Report(i / total);
        }
        foreach(var file in audioFiles)
        {
            System.IO.File.Delete(file);
            i++;
            progress.Report(i / total);
        }
        progress.Report(100);
    }

    private Backup CreateBackup()
    {
        var backupId = Guid.NewGuid().ToString();
        var date = DateTime.Now;
        var backupFilePath = FileSystem.BackupFile($"{backupId}-{date:yyyy-MM-dd-HH-mm-ss}.bak");
        var backup = new Backup(backupId, date, backupFilePath, false);
    
        return backup;
    }

    private Backup CreateBackup(IFormFile upload)
    {
        var backupId = Guid.NewGuid().ToString();
        var date = DateTime.Now;
        var backupFilePath = FileSystem.BackupFile($"{backupId}-{date:yyyy-MM-dd-HH-mm-ss}.bak");
        var backup = new Backup(backupId, date, backupFilePath, false, upload.Length / 1024.0 / 1024.0);
    
        return backup;
    }
}