using System.Reflection;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.SpaServices.ReactDevelopmentServer;
using Newtonsoft.Json;

var builder = WebApplication.CreateBuilder(args);

builder.Services.AddRazorPages();
builder.Services.AddOpenApi();
builder.Services.AddAntiforgery();

var app = builder.Build();

if (app.Environment.IsDevelopment())
{
    app.MapOpenApi();
}

app.UseHttpsRedirection();
app.UseAntiforgery();
app.MapRazorPages();

var root = Path.GetDirectoryName(Assembly.GetExecutingAssembly().Location);
if(root is null)
{
    throw new InvalidOperationException($"Could not find directory for path {Assembly.GetExecutingAssembly().Location}");
}
var sessionsFilePath = Path.Combine(root, "data", "sessions.json");

app.MapGet("/api/sessions", async () =>
{
    var json = await File.ReadAllTextAsync(sessionsFilePath);
    var data = JsonConvert.DeserializeObject<Data>(json);
    return Results.Ok(data);
})
.WithName("GetSessions");

app.MapPost("/api/sessions", async (Data data) =>
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

app.MapGet("/api/file/{filename}", async (string filename) =>
{
    var filePath = Path.Combine(root, "files", filename);
    var stream = new FileStream(filePath, FileMode.Open);
    return Results.File(stream, "application/json", filename);
})
.WithName("GetFile");

app.MapPost("/api/file", async (IFormFile upload, [FromForm] string sessionName) =>
{
    try
    {
        var filePath = Path.Combine(root, "files", upload.FileName);
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

app.UseStaticFiles();

if(app.Environment.IsDevelopment())
{
    app.UseWhen(
        context => context.Request.Path.StartsWithSegments("/dist"),
        then => then.UseSpa(spa =>
        {
            const int port = 5174;

            spa.Options.SourcePath = "client";
            spa.Options.DevServerPort = port;
            spa.UseReactDevelopmentServer(npmScript: "start");
            spa.UseProxyToSpaDevelopmentServer($"http://localhost:{port}");
        }));
}

app.Run();

record Data(List<Session> Sessions, List<Tune> Tunes, List<Performance> Performances);
record Session(string Id, string Name, string Filename, decimal[][]? Peaks = null, decimal? Duration = null);
record Tune(string Id, string Name);
record Performance(string Id, string TuneId, string TuneName, string SessionId, string SessionName, decimal StartTime, decimal EndTime);