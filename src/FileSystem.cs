namespace Sessions;

public class FileSystem
{
    public static readonly string Root = Directory.GetParent(Environment.CurrentDirectory)!.FullName;
    public static readonly string Files = Path.Combine(Root, "files");
    public static readonly string Data = Path.Combine(Files, "data");
    public static readonly string Audio = Path.Combine(Files, "audio");
    public static readonly string Backups = Path.Combine(Root, "backup");
    public static readonly string SessionsFile = DataFile("sessions.json");

    public static string DataFile(string fileName) => Path.Combine(Data, fileName);
    public static string AudioFile(string fileName) => Path.Combine(Audio, fileName);
    public static string BackupFile(string fileName) => Path.Combine(Backups, fileName);
}
