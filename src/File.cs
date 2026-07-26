using Newtonsoft.Json;

namespace Sessions;

public static class File
{
    public static async Task<Result<Void>> UploadFileAsync(IFormFile upload, string filePath)
    {
        Console.WriteLine($"Saving file: {filePath}...");
        
        using var stream = new FileStream(filePath, FileMode.Create);
        await upload.CopyToAsync(stream);
        return new OkResult();
    }

    public static async Task<Result<FileStreamData>> StreamFileAsync(string filePath, string contentType, string? fileName = null)
    {
        if(!System.IO.File.Exists(filePath))
        {
            return new NotFoundResult<FileStreamData>($"File not found: {filePath}");
        }

        fileName ??= Path.GetFileName(filePath);

        var stream = new FileStream(filePath, FileMode.Open);
        return new FileStreamResult(stream, contentType, fileName);
    }

    public static async Task<Result<T>> ReadJsonFileAsync<T>(string filePath)
    {
        if(!System.IO.File.Exists(filePath))
        {
            return new NotFoundResult<T>($"File not found: {filePath}");
        }

        var json = await System.IO.File.ReadAllTextAsync(filePath);
        
        try
        {
            var data = JsonConvert.DeserializeObject<T>(json);
            if(data is null)
            {
                return new ErrorResult<T>("File data deserialized to null");
            }
            return new OkResult<T>(data);
        }
        catch(JsonException ex)
        {
            return new ErrorResult<T>(ex.Message);
        }
    }

    public static async Task<Result<Void>> WriteJsonFileAsync<T>(string filePath, T data)
    {
        try
        {
            await System.IO.File.WriteAllTextAsync(filePath, JsonConvert.SerializeObject(data));
            return new OkResult();
        }
        catch(Exception ex)
        {
            return new ErrorResult<Void>(ex.Message);
        }
    }
}