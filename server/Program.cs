using Microsoft.AspNetCore.Mvc;
using Newtonsoft.Json;

var builder = WebApplication.CreateBuilder(args);

// Add services to the container.
// Learn more about configuring OpenAPI at https://aka.ms/aspnet/openapi
builder.Services.AddOpenApi().AddAntiforgery();

var app = builder.Build();

// Configure the HTTP request pipeline.
if (app.Environment.IsDevelopment())
{
    app.MapOpenApi();
}

app.UseHttpsRedirection();
app.UseAntiforgery();

var sessionsFilePath = Path.Combine("data", "sessions.json");

app.MapGet("/sessions", async () =>
{
    var json = await File.ReadAllTextAsync(sessionsFilePath);
    var data = JsonConvert.DeserializeObject<Data>(json);
    return Results.Ok(data);
})
.WithName("GetSessions");

app.MapPost("/sessions", async (Data data) =>
{
    try 
    {
        Console.WriteLine(data);
        await File.WriteAllTextAsync(sessionsFilePath, JsonConvert.SerializeObject(data));
        return Results.Ok();
    }
    catch(Exception ex)
    {
        return Results.InternalServerError(ex.Message);
    }
})
.DisableAntiforgery()
.WithName("PostSessions");

app.MapGet("/file/{filename}", async (string filename) =>
{
    var filePath = Path.Combine("files", filename);
    var stream = new FileStream(filePath, FileMode.Open);
    return Results.File(stream, "application/json", filename);
})
.WithName("GetFile");

app.MapPost("/file", async (IFormFile upload, [FromForm] string sessionName) =>
{
    try 
    {
        var filePath = Path.Combine("files", upload.FileName);
        using var stream = new FileStream(filePath, FileMode.Create);
        await upload.CopyToAsync(stream);
        var json = await File.ReadAllTextAsync(sessionsFilePath);
        var data = JsonConvert.DeserializeObject<Data>(json);
        var maxSessionId = data?.Sessions.Max(s => int.Parse(s.Id.Split('-')[1])) ?? 0;
        var newSession = new Session($"session-{maxSessionId + 1}", sessionName, upload.FileName);
        data?.Sessions.Add(newSession);
        await File.WriteAllTextAsync(sessionsFilePath, JsonConvert.SerializeObject(data));
        return Results.Ok(newSession);
    }
    catch(Exception ex)
    {
        return Results.InternalServerError(ex.Message);
    }
})
.DisableAntiforgery()
.WithName("PostFile");

app.Run();

record Data(List<Session> Sessions, List<Tune> Tunes, List<Performance> Performances);
record Session(string Id, string Name, string Filename, decimal[][]? Peaks = null, decimal? Duration = null);
record Tune(string Id, string Name);
record Performance(string Id, string TuneId, string TuneName, string SessionId, string SessionName, decimal StartTime, decimal EndTime);