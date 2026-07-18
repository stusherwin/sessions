using System.Diagnostics;

namespace Sessions;

public static class Process
{
    public static async Task<Result<Void>> StartProcess(string processFile, string arguments, Action<string> outputHandler)
    {
        using(var process = new System.Diagnostics.Process())
        { 
            process.StartInfo.FileName = processFile;
            process.StartInfo.Arguments = arguments;
            process.StartInfo.UseShellExecute = false;
            process.StartInfo.CreateNoWindow = true;
            process.StartInfo.RedirectStandardOutput = true;
            process.StartInfo.RedirectStandardError = true;

            process.EnableRaisingEvents = true;
            var exited = new TaskCompletionSource<bool>();
            process.Exited += (o, e) => exited.TrySetResult(true);

            DataReceivedEventHandler handler = (o, e) =>
            {
                if(e.Data is null)
                {
                    return;
                }

                outputHandler(e.Data);
            };
            process.OutputDataReceived += handler;
            process.ErrorDataReceived += handler;
            process.Start();
            process.BeginOutputReadLine();
            process.BeginErrorReadLine();
            await exited.Task;

            return new OkResult();
        }        
    }

}