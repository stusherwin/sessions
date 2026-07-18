namespace Sessions;

public static class ResultTaskExtensions
{
    public static async Task<IResult> ToHttp<T>(this Task<Result<T>> resultTask)
    {
        var result = await resultTask;

        return result.ToHttp();
    }

    public static async Task<Result<U>> Map<T, U>(this Task<Result<T>> resultTask, Func<T, U> func)
    {
        var result = await resultTask;

        return result.Map(func);
    }

    public static async Task<Result<U>> Map<T, U>(this Task<Result<T>> resultTask, Func<U> func)
    {
        var result = await resultTask;

        return result.Map(func);
    }

    public static async Task<Result<U>> MapAsync<T, U>(this Task<Result<T>> resultTask, Func<T, Task<U>> func)
    {
        var result = await resultTask;

        return await result.MapAsync(func);
    }

    public static async Task<Result<U>> MapAsync<T, U>(this Task<Result<T>> resultTask, Func<Task<U>> func)
    {
        var result = await resultTask;

        return await result.MapAsync(func);
    }

    public static async Task<Result<U>> Then<T, U>(this Task<Result<T>> resultTask, Func<T, Result<U>> func)
    {
        var result = await resultTask;
        var thenResult = result.Then(func);

        return thenResult;
    }

    public static async Task<Result<U>> ThenAsync<T, U>(this Task<Result<T>> resultTask, Func<T, Task<Result<U>>> func)
    {
        var result = await resultTask;
        var thenResult = await result.ThenAsync(func);

        return thenResult;
    }

    public static async Task<Result<U>> Then<T, U>(this Task<Result<T>> resultTask, Func<Result<U>> func)
    {
        var result = await resultTask;
        var thenResult = result.Then(func);

        return thenResult;
    }

    public static async Task<Result<U>> ThenAsync<T, U>(this Task<Result<T>> resultTask, Func<Task<Result<U>>> func)
    {
        var result = await resultTask;
        var thenResult = await result.ThenAsync(func);

        return thenResult;
    }
}