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

app.MapGet("/sessions", async () =>
{
    var json = await File.ReadAllTextAsync(Path.Combine("data", "sessions.json"));
    var data = JsonConvert.DeserializeObject<Data>(json);
    return Results.Ok(data);
})
.WithName("GetSessions");

app.MapGet("/file/{filename}", async (string filename) =>
{
    var filePath = Path.Combine("files", filename);
    var stream = new FileStream(filePath, FileMode.Open);
    return Results.File(stream, "application/json", filename);
})
.WithName("GetFile");

app.MapPost("/file", async (IFormFile upload) =>
{
    var filePath = Path.Combine("files", upload.FileName);
    using var stream = new FileStream(filePath, FileMode.Create);
    await upload.CopyToAsync(stream);
    return Results.Ok();
})
.DisableAntiforgery()
.WithName("PutFile");

app.Run();

record Data(Session[] Sessions, Tune[] Tunes, Performance[] Performances);
record Session(string Id, string Name, string Filename, decimal[][] Peaks, decimal Duration);
record Tune(string Id, string Name);
record Performance(string Id, string TuneId, string TuneName, string SessionId, string SessionName, decimal StartTime, decimal EndTime);