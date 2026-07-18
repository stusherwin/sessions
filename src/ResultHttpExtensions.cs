namespace Sessions;

public static class ResultHttpExtensions
{
    public static IResult ToHttp<T>(this Result<T> result) => result switch
    {
        NotFoundResult<T> notFound => Results.NotFound(notFound.Message),
        ErrorResult<T> error => Results.InternalServerError(error.Message),
        OkResult<T> ok => ok.Value switch {
        Void => Results.Ok(),
        FileStreamData fs => Results.File(fs.Stream, fs.ContentType, fs.FileName),
        _ => Results.Ok(ok.Value)
        },
        _ => throw new InvalidOperationException($"Http result not handled for type {result.GetType().Name}.")
    };
}