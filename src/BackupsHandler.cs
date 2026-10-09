using System.Text.RegularExpressions;
using System.Threading.Channels;

namespace Sessions;

public class BackupsHandler(Channel<TaskProgress> channel, IBackgroundTaskQueue taskQueue)
{
    public async Task<Result<Backup[]>> GetBackups()
    {
        var backups = GetAllBackups();
        
        return new OkResult<Backup[]>(backups);
    }

    public async Task<Result<Backup>> CreateBackup()
    {
        var backup = NewBackup();

        await taskQueue.QueueBackgroundWorkItemAsync(async (CancellationToken cancellationToken) =>
        {
            var progress = new ChannelProgress<BackupProgress>(backup.Id, 0, channel, new());

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

    public Task<Result<Backup>> ProcessBackupFile(IFormFile upload)
    {
        Console.WriteLine($"Processing uploaded backup file: {upload.FileName}");

        var backup = NewBackup(upload);
        var progress = new ChannelProgress<BackupProgress>(backup.Id, 0, channel, new());

        Console.WriteLine($"Uploading to: {backup.FilePath}");

        return File.UploadFileAsync(upload, backup.FilePath)
            .ThenAsync<Void, Backup>(async () => 
            {
                Console.WriteLine($"Uploading to: {backup.FilePath}");
                progress.Report(100);            
                return new OkResult<Backup>(backup);
            })
            .Else(error => Console.WriteLine($"Error: {error}"));
    }

    public Task<Result<Void>> RestoreBackup(string backupId)
    {
        return FindBackup(backupId)
            .ThenAsync<Void>(async backup =>
            {
                await taskQueue.QueueBackgroundWorkItemAsync(async (CancellationToken cancellationToken) =>
                {
                    var progress = new ChannelProgress<BackupProgress>(backupId, 0, channel, new());

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
                var  match = filenamePattern.Match(f);
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

    private Backup NewBackup()
    {
        var backupId = Guid.NewGuid().ToString();
        var date = DateTime.Now;
        var backupFilePath = FileSystem.BackupFile($"{backupId}-{date:yyyy-MM-dd-HH-mm-ss}.bak");
        var backup = new Backup(backupId, date, backupFilePath, false);
    
        return backup;
    }

    private Backup NewBackup(IFormFile upload)
    {
        var backupId = Guid.NewGuid().ToString();
        var date = DateTime.Now;
        var backupFilePath = FileSystem.BackupFile($"{backupId}-{date:yyyy-MM-dd-HH-mm-ss}.bak");
        var backup = new Backup(backupId, date, backupFilePath, false, upload.Length / 1024.0 / 1024.0);
    
        return backup;
    }
}