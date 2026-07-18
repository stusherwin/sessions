namespace Sessions;

public abstract record Result<T>
{
    public abstract Result<U> Map<U>(Func<T, U> func);
    public abstract Task<Result<U>> MapAsync<U>(Func<T, Task<U>> func);
    public abstract Result<U> Map<U>(Func<U> func);
    public abstract Task<Result<U>> MapAsync<U>(Func<Task<U>> func);
    public abstract Result<U> Then<U>(Func<T, Result<U>> func);
    public abstract Task<Result<U>> ThenAsync<U>(Func<T, Task<Result<U>>> func);
    public abstract Result<U> Then<U>(Func<Result<U>> func);
    public abstract Task<Result<U>> ThenAsync<U>(Func<Task<Result<U>>> func);
}

public record NotFoundResult<T>(string Message) : Result<T>
{
    public override Result<U> Map<U>(Func<T, U> func)
        => new NotFoundResult<U>(Message);
    
    public override Task<Result<U>> MapAsync<U>(Func<T, Task<U>> func)
        => Task.FromResult<Result<U>>(new NotFoundResult<U>(Message));
    
    public override Result<U> Map<U>(Func<U> func)
        => new NotFoundResult<U>(Message);
    
    public override Task<Result<U>> MapAsync<U>(Func<Task<U>> func)
        => Task.FromResult<Result<U>>(new NotFoundResult<U>(Message));

    public override Result<U> Then<U>(Func<T, Result<U>> func) 
        => new NotFoundResult<U>(Message);
    
    public override Task<Result<U>> ThenAsync<U>(Func<T, Task<Result<U>>> func) 
        => Task.FromResult<Result<U>>(new NotFoundResult<U>(Message));

    public override Result<U> Then<U>(Func<Result<U>> func) 
        => new NotFoundResult<U>(Message);    
    
    public override Task<Result<U>> ThenAsync<U>(Func<Task<Result<U>>> func) 
        => Task.FromResult<Result<U>>(new NotFoundResult<U>(Message));
}

public record ErrorResult<T>(string Message) : Result<T>
{
    public override Result<U> Map<U>(Func<T, U> func)
        => new ErrorResult<U>(Message);
    
    public override Task<Result<U>> MapAsync<U>(Func<T, Task<U>> func)
        => Task.FromResult<Result<U>>(new ErrorResult<U>(Message));
    
    public override Result<U> Map<U>(Func<U> func)
        => new ErrorResult<U>(Message);
    
    public override Task<Result<U>> MapAsync<U>(Func<Task<U>> func)
        => Task.FromResult<Result<U>>(new ErrorResult<U>(Message));

    public override Result<U> Then<U>(Func<T, Result<U>> func) 
        => new ErrorResult<U>(Message);
    
    public override Task<Result<U>> ThenAsync<U>(Func<T, Task<Result<U>>> func)
        => Task.FromResult<Result<U>>(new ErrorResult<U>(Message));

    public override Result<U> Then<U>(Func<Result<U>> func) 
        => new ErrorResult<U>(Message);

    public override Task<Result<U>> ThenAsync<U>(Func<Task<Result<U>>> func)
        => Task.FromResult<Result<U>>(new ErrorResult<U>(Message));
}

public record OkResult<T>(T Value) : Result<T>
{
    public override Result<U> Map<U>(Func<T, U> func)
        => new OkResult<U>(func(Value));

    public override async Task<Result<U>> MapAsync<U>(Func<T, Task<U>> func) 
    {
        var result = await func(Value);
        return new OkResult<U>(result);
    }
    
    public override Result<U> Map<U>(Func<U> func)
        => new OkResult<U>(func());

    public override async Task<Result<U>> MapAsync<U>(Func<Task<U>> func) 
    {
        var result = await func();
        return new OkResult<U>(result);
    }

    public override Result<U> Then<U>(Func<T, Result<U>> func) 
        => func(Value);
    
    public override async Task<Result<U>> ThenAsync<U>(Func<T, Task<Result<U>>> func) 
    {
        var result = await func(Value);
        return result;
    }

    public override Result<U> Then<U>(Func<Result<U>> func) 
        => func();

    public override async Task<Result<U>> ThenAsync<U>(Func<Task<Result<U>>> func) 
    {
        var result = await func();
        return result;
    }
}

public record OkResult() : OkResult<Void>(new Void());

public record FileStreamResult(FileStream Stream, string ContentType, string FileName) 
    : OkResult<FileStreamData>(new FileStreamData(Stream, ContentType, FileName));

public record Void();
public record FileStreamData(FileStream Stream, string ContentType, string FileName);