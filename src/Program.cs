using System.Threading.Channels;
using Microsoft.AspNetCore.Http.Features;
using Microsoft.AspNetCore.HttpOverrides;
using Microsoft.AspNetCore.Mvc.ApplicationModels;
using Microsoft.AspNetCore.SpaServices.ReactDevelopmentServer;

namespace Sessions;

public class Program 
{
    public class CustomPageRouteModelConvention : IPageRouteModelConvention
    {
        public void Apply(PageRouteModel model)
        {
            model.Selectors.Clear();
        }
    }

    public static async Task Main(string[] args)
    {
        var builder = WebApplication.CreateBuilder(args);
        var services = builder.Services;

        var appKey = Environment.GetEnvironmentVariable("APP_KEY");
        if(string.IsNullOrWhiteSpace(appKey))
        {
            throw new InvalidOperationException("Environment variable APP_KEY not defined.");
        }

        services.AddRazorPages(o => {
            o.Conventions.Add(new CustomPageRouteModelConvention());
            o.Conventions.AddPageRoute("/Index", appKey);
            o.Conventions.AddPageRoute("/NewUI", $"{appKey}/new-ui");
        });

        services.AddOpenApi();
        services.AddAntiforgery();
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
            app.UseForwardedHeaders(new ForwardedHeadersOptions
            {
                ForwardedHeaders = ForwardedHeaders.XForwardedFor | ForwardedHeaders.XForwardedProto
            });

            app.UseHsts();
            app.UseHttpsRedirection();
        }
        
        app.UseAntiforgery();
        app.MapRazorPages();

        app.MapGroup($"/{appKey}")
            .MapApi();

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
