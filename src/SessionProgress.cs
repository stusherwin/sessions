using System.Threading.Channels;

namespace Sessions;

public record SessionFileProcessProgress(string sessionId, int progress);

public interface ISessionProgress
{
    double? Duration { get; set; }
    void UpdateProgress(double progress);
    ISessionProgress Partial(double percentage);
}

public class SessionProgress(string sessionId, double? duration, int progress, Channel<SessionFileProcessProgress> channel)
    : ISessionProgress
{
    public int Progress { get; private set; } = progress;
    public double? Duration { get; set; } = duration;

    public void UpdateProgress(double progress)
    {
        var p = (int)Math.Round(progress);
        if(p > Progress) 
        {
            Progress = p;
            channel.Writer.TryWrite(new(sessionId, p));
            Console.WriteLine($"{p}%");
        }
    }

    public ISessionProgress Partial(double percentage)
        => new PartialProgress(this, Progress, percentage);

    class PartialProgress(SessionProgress progress, int startProgress, double percentage)
        : ISessionProgress
    {
        public double? Duration
        {
            get => progress.Duration;
            set => progress.Duration = value;
        }

        public void UpdateProgress(double partialProgress)
        {
            var p = partialProgress / 100.0 * percentage + startProgress;
            progress.UpdateProgress(p);
        }

        public ISessionProgress Partial(double subPercentage)
            => new PartialProgress(progress, progress.Progress, percentage * (subPercentage / 100.0));
    }
}
