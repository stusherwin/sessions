using System.Threading.Channels;

namespace Sessions;

public record TaskProgress(string taskId, int percentComplete);

public interface ISessionsProgress<T> : IProgress<double>
{
    T Data { get; set; }
    ISessionsProgress<T> Partial(double percentage);
}

public record UploadSessionProgress(double? Duration);
public record BackupProgress();

public class ChannelProgress<T>(string taskId, int percentComplete, Channel<TaskProgress> channel, T data)
    : ISessionsProgress<T>
{
    public int PercentComplete { get; private set; } = percentComplete;
    public T Data { get; set; } = data;

    public void Report(double percentComplete)
    {
        var p = (int)Math.Round(percentComplete);
        if(p > PercentComplete) 
        {
            PercentComplete = p;
            channel.Writer.TryWrite(new(taskId, p));
            Console.WriteLine($"{p}%");
        }
    }

    public ISessionsProgress<T> Partial(double percentage)
        => new PartialProgress(this, PercentComplete, percentage);

    class PartialProgress(ChannelProgress<T> progress, int startProgress, double percentage)
        : ISessionsProgress<T>
    {
        public T Data
        {
            get => progress.Data;
            set => progress.Data = value;
        }
        
        public void Report(double partialProgress)
        {
            var p = partialProgress / 100.0 * percentage + startProgress;
            progress.Report(p);
        }

        public ISessionsProgress<T> Partial(double subPercentage)
            => new PartialProgress(progress, progress.PercentComplete, percentage * (subPercentage / 100.0));
    }
}