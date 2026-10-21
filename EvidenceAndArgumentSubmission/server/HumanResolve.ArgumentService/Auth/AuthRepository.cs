using Npgsql;

namespace HumanResolve.ArgumentService.Auth;

public sealed class AuthRepository(NpgsqlDataSource source)
{
    public static void Initialize(NpgsqlDataSource source)
    {
        using var command = source.CreateCommand("""
            CREATE TABLE IF NOT EXISTS users (
              person_id uuid PRIMARY KEY, email text NOT NULL, display_name text NOT NULL,
              password_hash text NOT NULL, created_at timestamptz NOT NULL);
            CREATE UNIQUE INDEX IF NOT EXISTS users_email_unique ON users(lower(email));
            """);
        command.ExecuteNonQuery();
    }

    public AuthUser? FindByEmail(string email)
    {
        using var command = source.CreateCommand("SELECT person_id,email,display_name,password_hash,created_at FROM users WHERE lower(email)=lower($1)");
        command.Parameters.AddWithValue(email);
        using var reader = command.ExecuteReader();
        return reader.Read() ? Read(reader) : null;
    }

    public AuthUser? FindById(Guid personId)
    {
        using var command = source.CreateCommand("SELECT person_id,email,display_name,password_hash,created_at FROM users WHERE person_id=$1");
        command.Parameters.AddWithValue(personId);
        using var reader = command.ExecuteReader();
        return reader.Read() ? Read(reader) : null;
    }

    // Display-name search for choosing an opponent. Wildcards in the term are escaped and password hashes are not loaded.
    public IReadOnlyList<AuthUser> Search(string term, Guid excludePersonId, int limit)
    {
        var escaped = term.Replace("\\", "\\\\").Replace("%", "\\%").Replace("_", "\\_");
        using var command = source.CreateCommand("SELECT person_id,email,display_name,'',created_at FROM users WHERE display_name ILIKE $1 ESCAPE '\\' AND person_id <> $2 ORDER BY display_name, person_id LIMIT $3");
        command.Parameters.AddWithValue($"%{escaped}%");
        command.Parameters.AddWithValue(excludePersonId);
        command.Parameters.AddWithValue(limit);
        using var reader = command.ExecuteReader();
        var found = new List<AuthUser>();
        while (reader.Read()) found.Add(Read(reader));
        return found;
    }

    public AuthUser Create(string email, string displayName, string passwordHash)
    {
        var user = new AuthUser(Guid.NewGuid(), email, displayName, passwordHash, DateTimeOffset.UtcNow);
        using var command = source.CreateCommand("INSERT INTO users(person_id,email,display_name,password_hash,created_at) VALUES ($1,$2,$3,$4,$5)");
        command.Parameters.AddWithValue(user.PersonId);
        command.Parameters.AddWithValue(user.Email);
        command.Parameters.AddWithValue(user.DisplayName);
        command.Parameters.AddWithValue(user.PasswordHash);
        command.Parameters.AddWithValue(user.CreatedAt);
        command.ExecuteNonQuery();
        return user;
    }

    private static AuthUser Read(NpgsqlDataReader reader) => new(reader.GetGuid(0), reader.GetString(1), reader.GetString(2), reader.GetString(3), reader.GetFieldValue<DateTimeOffset>(4));
}
