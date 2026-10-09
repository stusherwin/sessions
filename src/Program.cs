using System.Threading.Channels;
using Microsoft.AspNetCore.Http.Features;
using Microsoft.AspNetCore.HttpOverrides;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.SpaServices.ReactDevelopmentServer;

namespace Sessions;

public class Program 
{
    public static async Task Main(string[] args)
    {
        var builder = WebApplication.CreateBuilder(args);
        var services = builder.Services;

        services.AddRazorPages();
        services.AddOpenApi();
        // services.AddAntiforgery();
        services.AddHostedService<QueuedHostedService>();
        services.AddSingleton<IBackgroundTaskQueue>(ctx =>
            new BackgroundTaskQueue(100));
        services.AddSingleton(ctx => Channel.CreateUnbounded<TaskProgress>());
        services.AddSingleton<SessionHandler>();
        services.AddSingleton<BackupsHandler>();

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
        } else
        {
            Console.WriteLine("Using ForwardedHeaders");
            app.UseForwardedHeaders(new ForwardedHeadersOptions
            {
                ForwardedHeaders = ForwardedHeaders.XForwardedFor | ForwardedHeaders.XForwardedProto
            });
        }

        //app.UseHttpsRedirection();
        // app.UseAntiforgery();
        app.MapRazorPages();

        app.MapGet("/api/sessions", (SessionHandler sessions) => 
            sessions.GetSessions().ToHttp())
        .WithName("GetSessions");
        
        app.MapPost("/api/sessions", (Data data, SessionHandler sessions) => 
            sessions.WriteSessions(data).ToHttp())
        .WithName("PostSessions");

        app.MapGet("/api/session/{sessionId}/file", (string sessionId, SessionHandler sessions) =>
            sessions.StreamSessionFile(sessionId).ToHttp())
        .WithName("GetSessionFile");

        app.MapGet("/api/session/{sessionId}/peaks", (string sessionId, SessionHandler sessions) =>
            sessions.GetSessionPeaks(sessionId).ToHttp())
        .WithName("GetSessionPeaks");

        app.MapPost("/api/session", (IFormFile upload, [FromForm] string sessionName, SessionHandler sessions) =>
            sessions.ProcessSessionFile(upload, sessionName).ToHttp())
        .WithName("PostSessionFile");

        app.MapGet("/api/backups", (BackupsHandler backups) => 
            backups.GetBackups().ToHttp())
        .WithName("GetBackups");

        app.MapGet("/api/backups/{backupId}", (string backupId, BackupsHandler backups) => 
            backups.StreamBackupFile(backupId).ToHttp())
        .WithName("GetBackup");

        app.MapPost("/api/backups", (IFormFile upload, BackupsHandler backups) => 
            backups.ProcessBackupFile(upload).ToHttp())
        .WithName("PostBackup")
        .DisableAntiforgery();

        app.MapPost("/api/backups/create", (BackupsHandler backups) => 
            backups.CreateBackup().ToHttp())
        .WithName("PostBackupCreate");

        app.MapPost("/api/backups/restore/{backupId}", (string backupId, BackupsHandler backups) => 
            backups.RestoreBackup(backupId).ToHttp())
        .WithName("PostBackupRestore");

        app.MapGet("api/tasks/progress", (CancellationToken cancellationToken, Channel<TaskProgress> channel) =>
            Results.ServerSentEvents(
                channel.Reader.ReadAllAsync(cancellationToken),
                eventType: "task-progress"))
        .WithName("GetTaskProgress");

        using (var scope = app.Services.CreateScope())
        {
            var sessions = scope.ServiceProvider.GetRequiredService<SessionHandler>();
            await sessions.ProcessSessions();
        }

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