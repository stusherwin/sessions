using Newtonsoft.Json;

namespace Sessions;

public record Data(
    List<Session> Sessions, 
    List<Tune> Tunes, 
    List<Performance> Performances);

public record Session(
    string Id, 
    string Name, 
    bool Processed,
    decimal? Duration = null);

public record Tune(
    string Id, 
    string Name);

public record Performance(
    string Id, 
    string TuneId, 
    string TuneName, 
    string SessionId, 
    string SessionName, 
    decimal StartTime, 
    decimal EndTime);

public record Waveform(
    decimal Version,
    int Channels,
    [JsonProperty("sample_rate")]
    int SampleRate,
    [JsonProperty("samples_per_pixel")]
    int SamplesPerPixel,
    int Bits,
    int Length,
    decimal[] Data);

public record Backup(
    string Id,
    DateTime Date,
    string FilePath,
    bool Processed,
    double? Size = null);