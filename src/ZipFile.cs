// Source - https://stackoverflow.com/a/42436311
// Posted by Peter Duniho, modified by community. See post 'Timeline' for change history
// Retrieved 2026-07-25, License - CC BY-SA 3.0

using System.IO.Compression;

namespace Sessions;

static class ZipFileWithProgress
{
    public static void CreateFromDirectory(string sourceDirectoryName, string destinationArchiveFileName, IProgress<double> progress)
    {
        sourceDirectoryName = Path.GetFullPath(sourceDirectoryName);

        FileInfo[] sourceFiles =
            new DirectoryInfo(sourceDirectoryName).GetFiles("*", SearchOption.AllDirectories);
        double totalBytes = sourceFiles.Sum(f => f.Length);
        long currentBytes = 0;

        using (ZipArchive archive = ZipFile.Open(destinationArchiveFileName, ZipArchiveMode.Create))
        {
            foreach (FileInfo file in sourceFiles)
            {
                // NOTE: naive method to get sub-path from file name, relative to
                // input directory. Production code should be more robust than this.
                // Either use Path class or similar to parse directory separators and
                // reconstruct output file name, or change this entire method to be
                // recursive so that it can follow the sub-directories and include them
                // in the entry name as they are processed.
                string entryName = file.FullName.Substring(sourceDirectoryName.Length + 1);
                ZipArchiveEntry entry = archive.CreateEntry(entryName);

                entry.LastWriteTime = file.LastWriteTime;

                using (Stream inputStream = System.IO.File.OpenRead(file.FullName))
                using (Stream outputStream = entry.Open())
                {
                    Stream progressStream = new StreamWithProgress(inputStream,
                        new BasicProgress<int>(i =>
                        {
                            currentBytes += i;
                            progress.Report(currentBytes / totalBytes * 100.0);
                        }), null);

                    progressStream.CopyTo(outputStream);
                }
            }
        }
    }

    public static void ExtractToDirectory(string sourceArchiveFileName, string destinationDirectoryName, IProgress<double> progress)
    {
        using (ZipArchive archive = ZipFile.OpenRead(sourceArchiveFileName))
        {
            double totalBytes = archive.Entries.Sum(e => e.Length);
            long currentBytes = 0;

            foreach (ZipArchiveEntry entry in archive.Entries)
            {
                if(entry.Name.Length == 0)
                {
                    continue;
                }

                string fileName = Path.Combine(destinationDirectoryName, entry.FullName);

                Directory.CreateDirectory(Path.GetDirectoryName(fileName));
                using (Stream inputStream = entry.Open())
                using(Stream outputStream = System.IO.File.OpenWrite(fileName))
                {
                    Stream progressStream = new StreamWithProgress(outputStream, null,
                        new BasicProgress<int>(i =>
                        {
                            currentBytes += i;
                            progress.Report(currentBytes / totalBytes * 100.0);
                        }));

                    inputStream.CopyTo(progressStream);
                }

                System.IO.File.SetLastWriteTime(fileName, entry.LastWriteTime.LocalDateTime);
            }
        }
    }
}

// Source - https://stackoverflow.com/a/42436311
// Posted by Peter Duniho, modified by community. See post 'Timeline' for change history
// Retrieved 2026-07-25, License - CC BY-SA 3.0

class StreamWithProgress : Stream
{
    // NOTE: for illustration purposes. For production code, one would want to
    // override *all* of the virtual methods, delegating to the base _stream object,
    // to ensure performance optimizations in the base _stream object aren't
    // bypassed.

    private readonly Stream _stream;
    private readonly IProgress<int> _readProgress;
    private readonly IProgress<int> _writeProgress;

    public StreamWithProgress(Stream stream, IProgress<int> readProgress, IProgress<int> writeProgress)
    {
        _stream = stream;
        _readProgress = readProgress;
        _writeProgress = writeProgress;
    }

    public override bool CanRead { get { return _stream.CanRead; } }
    public override bool CanSeek {  get { return _stream.CanSeek; } }
    public override bool CanWrite {  get { return _stream.CanWrite; } }
    public override long Length {  get { return _stream.Length; } }
    public override long Position
    {
        get { return _stream.Position; }
        set { _stream.Position = value; }
    }

    public override void Flush() { _stream.Flush(); }
    public override long Seek(long offset, SeekOrigin origin) { return _stream.Seek(offset, origin); }
    public override void SetLength(long value) { _stream.SetLength(value); }

    public override int Read(byte[] buffer, int offset, int count)
    {
        int bytesRead = _stream.Read(buffer, offset, count);

        _readProgress?.Report(bytesRead);
        return bytesRead;
    }

    public override void Write(byte[] buffer, int offset, int count)
    {
        _stream.Write(buffer, offset, count);
        _writeProgress?.Report(count);
    }
}

// Source - https://stackoverflow.com/a/42436311
// Posted by Peter Duniho, modified by community. See post 'Timeline' for change history
// Retrieved 2026-07-25, License - CC BY-SA 3.0

class BasicProgress<T> : IProgress<T>
{
    private readonly Action<T> _handler;

    public BasicProgress(Action<T> handler)
    {
        _handler = handler;
    }

    void IProgress<T>.Report(T value)
    {
        _handler(value);
    }
}
