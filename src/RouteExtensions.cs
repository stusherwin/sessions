using System.Threading.Channels;
using Microsoft.AspNetCore.Mvc;

namespace Sessions;

public static class RouteExtensions 
{
    public static RouteGroupBuilder MapApi(this RouteGroupBuilder group)
    {
        group.MapGet("api/sessions", (SessionHandler sessions) => 
            sessions.GetSessions().ToHttp())
        .WithName("GetSessions");
        
        group.MapPost("api/sessions", (Data data, SessionHandler sessions) => 
            sessions.WriteSessions(data).ToHttp())
        .WithName("PostSessions");

        group.MapGet("api/session/{sessionId}/file", (string sessionId, SessionHandler sessions) =>
            sessions.StreamSessionFile(sessionId).ToHttp())
        .WithName("GetSessionFile");

        group.MapGet("api/session/{sessionId}/peaks", (string sessionId, SessionHandler sessions) =>
            sessions.GetSessionPeaks(sessionId).ToHttp())
        .WithName("GetSessionPeaks");

        group.MapPost("api/session", (IFormFile upload, [FromForm] string sessionName, SessionHandler sessions) =>
            sessions.ProcessSessionFile(upload, sessionName).ToHttp())
        .WithName("PostSessionFile");

        group.MapGet("api/backups", (BackupsHandler backups) => 
            backups.GetBackups().ToHttp())
        .WithName("GetBackups");

        group.MapGet("api/backups/{backupId}", (string backupId, BackupsHandler backups) => 
            backups.StreamBackupFile(backupId).ToHttp())
        .WithName("GetBackup");

        group.MapPost("api/backups", async (IFormFile upload, BackupsHandler backups) =>
            backups.ProcessBackupFile(upload).ToHttp())
        .WithName("PostBackup");

        group.MapPost("api/backups/create", (BackupsHandler backups) => 
            backups.CreateBackup().ToHttp())
        .WithName("PostBackupCreate");

        group.MapPost("api/backups/restore/{backupId}", (string backupId, BackupsHandler backups) => 
            backups.RestoreBackup(backupId).ToHttp())
        .WithName("PostBackupRestore");

        group.MapGet("api/tasks/progress", (CancellationToken cancellationToken, Channel<TaskProgress> channel) =>
            Results.ServerSentEvents(
                channel.Reader.ReadAllAsync(cancellationToken),
                eventType: "task-progress"))
        .WithName("GetTaskProgress");

        return group;
    }
}