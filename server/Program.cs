using System.Net;
using System.Net.Http.Headers;
using Newtonsoft.Json;

var builder = WebApplication.CreateBuilder(args);

// Add services to the container.
// Learn more about configuring OpenAPI at https://aka.ms/aspnet/openapi
builder.Services.AddOpenApi();

var app = builder.Build();

// Configure the HTTP request pipeline.
if (app.Environment.IsDevelopment())
{
    app.MapOpenApi();
}

app.UseHttpsRedirection();

app.MapGet("/sessions", async () =>
{
    var json = await File.ReadAllTextAsync(Path.Combine("data", "sessions.json"));
    var data = JsonConvert.DeserializeObject<Data>(json);
    return data;
})
.WithName("GetSessions");

app.MapGet("/file/{filename}", async (string filename) =>
{
    var filePath = Path.Combine("files", filename);
    var stream = new FileStream(filePath, FileMode.Open);
    return Results.File(stream, "application/json", filename);
})
.WithName("GetFile");

app.Run();

record Data(Session[] Sessions, Tune[] Tunes, Performance[] Performances);
record Session(string Id, string Name, string Filename, decimal[][] Peaks, decimal Duration);
record Tune(string Id, string Name);
record Performance(string Id, string TuneId, string TuneName, string SessionId, string SessionName, decimal StartTime, decimal EndTime);