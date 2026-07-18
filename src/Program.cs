using Microsoft.AspNetCore.Http.Features;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.SpaServices.ReactDevelopmentServer;

namespace Sessions;

public class Program 
{
    public static void Main(string[] args)
    {
        var builder = WebApplication.CreateBuilder(args);
        var services = builder.Services;

        services.AddRazorPages();
        services.AddOpenApi();
        services.AddAntiforgery();
        services.AddHostedService<QueuedHostedService>();
        services.AddSingleton<IBackgroundTaskQueue>(ctx =>
            new BackgroundTaskQueue(100));

        const int MaxRequestSizeBytes = 1 * 1024 * 1024 * 1024;
        services.Configure<FormOptions>(x => {
            x.ValueLengthLimit = MaxRequestSizeBytes;
            x.MultipartBodyLengthLimit = MaxRequestSizeBytes;
        });
        builder.WebHost.ConfigureKestrel(o => o.Limits.MaxRequestBodySize = MaxRequestSizeBytes);

        var app = builder.Build();

        if (app.Environment.IsDevelopment())
        {
            app.MapOpenApi();
        }

        app.UseHttpsRedirection();
        app.UseAntiforgery();
        app.MapRazorPages();

        var root = Directory.GetParent(Environment.CurrentDirectory)!.FullName;
        var handler = new SessionHandler(root);

        app.MapGet("/api/sessions", () => 
            handler.GetSessions().ToHttp())
        .WithName("GetSessions");
        
        app.MapPost("/api/sessions", (Data data) => 
            handler.WriteSessions(data).ToHttp())
        .WithName("PostSessions");

        app.MapGet("/api/session/{sessionId}/file", (string sessionId) =>
            handler.StreamSession(sessionId).ToHttp())
        .WithName("GetSessionFile");

        app.MapGet("/api/session/{sessionId}/peaks", async (string sessionId) =>
            handler.GetSessionPeaks(sessionId).ToHttp())
        .WithName("GetSessionPeaks");

        app.MapGet("api/sessions/progress", (CancellationToken cancellationToken) =>
            Results.ServerSentEvents(
                handler.GetProgress(cancellationToken),
                eventType: "session-progress"))
        .WithName("GetSessionProgress");

        app.MapPost("/api/session", async (IFormFile upload, [FromForm] string sessionName, IBackgroundTaskQueue taskQueue) =>
            handler.ProcessSessionFile(upload, sessionName, taskQueue).ToHttp())
        .WithName("PostSessionFile");

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
    }
}