using System.Text.RegularExpressions;
using Newtonsoft.Json;

namespace Sessions;

public static class Audio
{
    public static async Task<Result<Void>> Ffmpeg(string sourceFilePath, string destFilePath, string format, ISessionsProgress<UploadSessionProgress> progress)
    {
        Console.WriteLine($"Converting to {format}...");

        return await Process.StartProcess("ffmpeg", $"-i {sourceFilePath} -f {format} {destFilePath}", output =>
        {
            if(!progress.Data.Duration.HasValue)
            {
                var duration = new Regex(@"Duration: (\d\d):(\d\d):(\d\d).(\d\d)").Match(output);
                if(duration.Success)
                {
                    var h = int.Parse(duration.Groups[1].Value);
                    var m = int.Parse(duration.Groups[2].Value);
                    var s = int.Parse(duration.Groups[3].Value);
                    var ms = int.Parse(duration.Groups[4].Value);
                    progress.Data = new(new TimeSpan(0, h, m, s, ms).TotalSeconds);
                }
            }                

            var time = new Regex(@"time=(\d\d):(\d\d):(\d\d).(\d\d)").Match(output);
            if(time.Success)
            {
                var h = int.Parse(time.Groups[1].Value);
                var m = int.Parse(time.Groups[2].Value);
                var s = int.Parse(time.Groups[3].Value);
                var ms = int.Parse(time.Groups[4].Value);
                var t = new TimeSpan(0, h, m, s, ms).TotalSeconds;

                if(progress.Data.Duration.HasValue) {
                    progress.Report(t / progress.Data.Duration.Value * 100.0);
                }
            }            
        });
    }

    public static async Task<Result<decimal[][]>> AudioWaveform(string mp3FilePath, ISessionsProgress<UploadSessionProgress> progress)
    {
        Console.WriteLine("Processing waveform...");

        var waveformFilePath = Path.Combine(Path.GetTempPath(), $"{Guid.NewGuid()}.json");        
        return await Process.StartProcess("audiowaveform", $"-i {mp3FilePath} -o {waveformFilePath} --pixels-per-second 20 --bits 8 --input-format mp3", output =>
        {
            var done = new Regex(@"Done: (\d+)%").Match(output);
            if(done.Success)
            {
                progress.Report(double.Parse(done.Groups[1].Value));
            }
        }).ThenAsync<Void, decimal[][]>(async () =>
        {
            var waveformJson = await System.IO.File.ReadAllTextAsync(waveformFilePath);
            var waveformData = JsonConvert.DeserializeObject<Waveform>(waveformJson);

            if(waveformData is null)
            {
                Console.WriteLine("Could not decode audio waveform.");
                return new ErrorResult<decimal[][]>("Could not decode audio waveform.");
            }

            var data = waveformData.Data;
            var channels = waveformData.Channels;
            // number of decimals to use when rounding the peak value
            var digits = 2;

            var max_val = data.Max();
            var new_data = new List<decimal>();
            foreach(var x in data)
            {
                new_data.Add(Math.Round(x / max_val, digits));
            }
            
            // audiowaveform is generating interleaved peak data when using the --split-channels flag, so we have to deinterleave it
            // if(channels > 1) {
            //     new_data = Deinterleave(new_data, channels);
            // }

            // decimal[][] Deinterleave(List<decimal> data, int channelCount) {
            //     // first step is to separate the values for each audio channel and min/max value pair, hence we get an array with channelCount * 2 arrays
            //     var deinterleaved = [data[idx::channelCount * 2] for idx in range(channelCount * 2)]
            //     new_data = []

            //     // this second step combines each min and max value again in one array so we have one array for each channel
            //     for(var ch = 0; ch < channelCount; ch++) {
            //         var idx1 = 2 * ch;
            //         var idx2 = 2 * ch + 1;
            //         ch_data = [None] * (len(deinterleaved[idx1]) + len(deinterleaved[idx2]))
            //         ch_data[::2] = deinterleaved[idx1]
            //         ch_data[1::2] = deinterleaved[idx2]
            //         new_data.append(ch_data)
            //     }
            //     return new_data
            // }

            return new OkResult<decimal[][]>([new_data.ToArray()]);
        });
    }
}