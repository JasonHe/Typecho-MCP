<?php
declare(strict_types=1);

error_reporting(E_ALL);
ini_set('display_errors', 'stderr');

main($argv);

function main(array $argv): void
{
    $raw = trim((string) stream_get_contents(STDIN));

    if ($raw === '' && isset($argv[1]) && $argv[1] === 'health') {
        $request = [
            'jsonrpc' => '2.0',
            'id' => 'health',
            'method' => 'system.health',
            'params' => new stdClass(),
        ];
    } else {
        $request = json_decode($raw, true);
    }

    if (!is_array($request)) {
        respondError(null, 'INVALID_JSON', 'Request body must be a JSON object.');
        return;
    }

    $id = $request['id'] ?? null;
    $method = $request['method'] ?? '';
    $params = is_array($request['params'] ?? null) ? $request['params'] : [];

    try {
        $root = detectRoot();
        $config = parseTypechoConfig($root);

        $result = match ($method) {
            'system.health' => systemHealth($root, $config),
            'site.info' => siteInfo($root, $config),
            'posts.list' => postsList($root, $config, $params),
            'posts.get' => postsGet($root, $config, $params),
            'posts.createDraft' => postsCreateDraft($root, $config, $params),
            'posts.update' => postsUpdate($root, $config, $params),
            'posts.publish' => postsPublish($root, $config, $params),
            'media.upload' => mediaUpload($root, $config, $params),
            'media.list' => mediaList($root, $config, $params),
            'taxonomy.list' => taxonomyList($root, $config),
            default => throw new AgentError('METHOD_NOT_FOUND', "Unknown method: {$method}"),
        };

        respondResult($id, $result);
    } catch (AgentError $error) {
        respondError($id, $error->codeName, $error->getMessage(), $error->retryable, $error->details);
    } catch (Throwable $error) {
        respondError($id, 'INTERNAL_ERROR', $error->getMessage());
    }
}

function detectRoot(): string
{
    $root = getenv('TYPECHO_ROOT') ?: getcwd();
    $real = realpath($root);

    if ($real === false) {
        throw new AgentError('ROOT_NOT_FOUND', "Typecho root does not exist: {$root}");
    }

    if (!is_file($real . '/config.inc.php')) {
        throw new AgentError('TYPECHO_CONFIG_NOT_FOUND', "config.inc.php was not found under {$real}");
    }

    return $real;
}

function parseTypechoConfig(string $root): array
{
    $configPath = $root . '/config.inc.php';
    $content = (string) file_get_contents($configPath);

    preg_match("/new\s+\\\\?Typecho\\\\?Db\s*\(\s*'([^']+)'\s*,\s*'([^']+)'\s*\)/", $content, $dbMatch);
    preg_match("/'file'\s*=>\s*'([^']+)'/", $content, $fileMatch);
    preg_match("/'database'\s*=>\s*'([^']+)'/", $content, $databaseMatch);
    preg_match("/'host'\s*=>\s*'([^']+)'/", $content, $hostMatch);

    $adapter = $dbMatch[1] ?? null;
    $prefix = $dbMatch[2] ?? 'typecho_';
    $dbFile = $fileMatch[1] ?? null;

    if ($dbFile !== null && str_starts_with($dbFile, './')) {
        $dbFile = $root . '/' . substr($dbFile, 2);
    }

    return [
        'adapter' => $adapter,
        'prefix' => $prefix,
        'dbFile' => $dbFile,
        'database' => $databaseMatch[1] ?? null,
        'host' => $hostMatch[1] ?? null,
        'configPath' => $configPath,
    ];
}

function systemHealth(string $root, array $config): array
{
    return [
        'ok' => true,
        'agent' => [
            'version' => '0.1.1',
            'protocolVersion' => '2026-05-31',
        ],
        'php' => [
            'version' => PHP_VERSION,
            'sapi' => PHP_SAPI,
        ],
        'root' => $root,
        'markers' => [
            'config.inc.php' => is_file($root . '/config.inc.php'),
            'index.php' => is_file($root . '/index.php'),
            'var/Typecho' => is_dir($root . '/var/Typecho'),
            'usr' => is_dir($root . '/usr'),
        ],
        'site' => siteInfo($root, $config),
        'capabilities' => operationCapabilities($config),
    ];
}

function siteInfo(string $root, array $config): array
{
    $options = readOptions($config);

    return [
        'title' => $options['title'] ?? null,
        'description' => $options['description'] ?? null,
        'siteUrl' => $options['siteUrl'] ?? null,
        'root' => $root,
        'database' => [
            'adapter' => $config['adapter'],
            'prefix' => $config['prefix'],
            'kind' => databaseKind($config),
            'fileExists' => $config['dbFile'] ? is_file($config['dbFile']) : null,
            'compatibility' => databaseCompatibility($config),
        ],
    ];
}

function postsList(string $root, array $config, array $params): array
{
    $limit = (int) ($params['limit'] ?? 10);
    $limit = max(1, min(50, $limit));
    $pdo = openReadOnlyPdo($config);
    $prefix = safePrefix($config['prefix']);
    $where = ["type = 'post'"];
    $bindings = [];

    if (isset($params['status']) && $params['status'] !== '') {
        $where[] = 'status = :status';
        $bindings[':status'] = (string) $params['status'];
    } elseif (!($params['includeHidden'] ?? false)) {
        $where[] = "status != 'hidden'";
    }

    if (isset($params['search']) && trim((string) $params['search']) !== '') {
        $where[] = '(title LIKE :search OR text LIKE :search)';
        $bindings[':search'] = '%' . trim((string) $params['search']) . '%';
    }

    $whereSql = implode(' AND ', $where);

    $statement = $pdo->prepare(
        "SELECT cid, title, slug, created, modified, status, type, authorId, commentsNum
         FROM {$prefix}contents
         WHERE {$whereSql}
         ORDER BY modified DESC
         LIMIT :limit"
    );
    foreach ($bindings as $key => $value) {
        $statement->bindValue($key, $value, PDO::PARAM_STR);
    }
    $statement->bindValue(':limit', $limit, PDO::PARAM_INT);
    $statement->execute();

    $posts = [];
    foreach ($statement->fetchAll(PDO::FETCH_ASSOC) as $row) {
        $posts[] = normalizePostSummary($row);
    }

    return [
        'site' => siteInfo($root, $config),
        'posts' => $posts,
    ];
}

function postsGet(string $root, array $config, array $params): array
{
    if (!isset($params['cid'])) {
        throw new AgentError('CID_REQUIRED', 'posts.get requires cid.');
    }

    $cid = (int) $params['cid'];
    $pdo = openReadOnlyPdo($config);
    $prefix = safePrefix($config['prefix']);

    $statement = $pdo->prepare(
        "SELECT cid, title, slug, created, modified, text, status, type, authorId, commentsNum, allowComment, allowPing, allowFeed
         FROM {$prefix}contents
         WHERE cid = :cid
         LIMIT 1"
    );
    $statement->bindValue(':cid', $cid, PDO::PARAM_INT);
    $statement->execute();

    $row = $statement->fetch(PDO::FETCH_ASSOC);
    if (!$row) {
        throw new AgentError('POST_NOT_FOUND', "Post {$cid} was not found.", false);
    }

    $terms = $pdo->prepare(
        "SELECT m.name, m.slug, m.type
         FROM {$prefix}metas m
         INNER JOIN {$prefix}relationships r ON r.mid = m.mid
         WHERE r.cid = :cid
         ORDER BY m.type, m.name"
    );
    $terms->bindValue(':cid', $cid, PDO::PARAM_INT);
    $terms->execute();

    return [
        'site' => siteInfo($root, $config),
        'post' => normalizePost($row, $terms->fetchAll(PDO::FETCH_ASSOC)),
    ];
}

function postsCreateDraft(string $root, array $config, array $params): array
{
    $title = trim((string) ($params['title'] ?? ''));
    $markdown = (string) ($params['markdown'] ?? '');

    if ($title === '') {
        throw new AgentError('TITLE_REQUIRED', 'posts.createDraft requires title.');
    }

    if (trim($markdown) === '') {
        throw new AgentError('CONTENT_REQUIRED', 'posts.createDraft requires markdown.');
    }

    $pdo = openWritePdo($config);
    $prefix = safePrefix($config['prefix']);
    $now = time();
    $authorId = defaultAuthorId($pdo, $prefix);
    $slug = normalizeSlug((string) ($params['slug'] ?? $title));
    $text = normalizeMarkdownText($markdown);

    $pdo->beginTransaction();
    try {
        $statement = $pdo->prepare(
            "INSERT INTO {$prefix}contents
             (title, slug, created, modified, text, \"order\", authorId, template, type, status, password, commentsNum, allowComment, allowPing, allowFeed, parent)
             VALUES
             (:title, :slug, :created, :modified, :text, 0, :authorId, NULL, 'post', 'draft', NULL, 0, '1', '1', '1', 0)"
        );
        $statement->execute([
            ':title' => $title,
            ':slug' => $slug,
            ':created' => $now,
            ':modified' => $now,
            ':text' => $text,
            ':authorId' => $authorId,
        ]);
        $cid = (int) $pdo->lastInsertId();

        applyTaxonomy($pdo, $prefix, $cid, $params['categories'] ?? [], $params['tags'] ?? []);
        $pdo->commit();
    } catch (Throwable $error) {
        $pdo->rollBack();
        throw $error;
    }

    return postsGet($root, $config, ['cid' => $cid]);
}

function postsUpdate(string $root, array $config, array $params): array
{
    if (!isset($params['cid'])) {
        throw new AgentError('CID_REQUIRED', 'posts.update requires cid.');
    }

    $cid = (int) $params['cid'];
    $pdo = openWritePdo($config);
    $prefix = safePrefix($config['prefix']);
    $existing = fetchPostRow($pdo, $prefix, $cid);
    if (!$existing) {
        throw new AgentError('POST_NOT_FOUND', "Post {$cid} was not found.", false);
    }

    $fields = [];
    $values = [':cid' => $cid, ':modified' => time()];

    $assign = function (string $field, string $param, mixed $value) use (&$fields, &$values): void {
        $fields[] = "{$field} = :{$param}";
        $values[":{$param}"] = $value;
    };

    if (array_key_exists('title', $params)) {
        $title = trim((string) $params['title']);
        if ($title === '') {
            throw new AgentError('TITLE_REQUIRED', 'title cannot be empty.');
        }
        $assign('title', 'title', $title);
    }

    if (array_key_exists('slug', $params)) {
        $assign('slug', 'slug', normalizeSlug((string) $params['slug']));
    }

    if (array_key_exists('markdown', $params)) {
        $assign('text', 'text', normalizeMarkdownText((string) $params['markdown']));
    }

    if (array_key_exists('status', $params)) {
        $status = (string) $params['status'];
        if (!in_array($status, ['draft', 'publish', 'hidden', 'waiting'], true)) {
            throw new AgentError('INVALID_STATUS', "Unsupported status: {$status}");
        }
        $assign('status', 'status', $status);
    }

    foreach (['allowComment', 'allowPing', 'allowFeed'] as $flag) {
        if (array_key_exists($flag, $params)) {
            $assign($flag, $flag, truthyFlag($params[$flag]));
        }
    }

    if ($fields === [] && !array_key_exists('categories', $params) && !array_key_exists('tags', $params)) {
        throw new AgentError('NO_UPDATE_FIELDS', 'posts.update received no update fields.');
    }

    $fields[] = 'modified = :modified';

    $pdo->beginTransaction();
    try {
        if ($fields !== ['modified = :modified']) {
            $sql = "UPDATE {$prefix}contents SET " . implode(', ', $fields) . " WHERE cid = :cid";
            $statement = $pdo->prepare($sql);
            $statement->execute($values);
        }

        if (array_key_exists('categories', $params) || array_key_exists('tags', $params)) {
            $categories = $params['categories'] ?? currentTerms($pdo, $prefix, $cid, 'category');
            $tags = $params['tags'] ?? currentTerms($pdo, $prefix, $cid, 'tag');
            applyTaxonomy($pdo, $prefix, $cid, $categories, $tags);
        }

        $pdo->commit();
    } catch (Throwable $error) {
        $pdo->rollBack();
        throw $error;
    }

    return postsGet($root, $config, ['cid' => $cid]);
}

function postsPublish(string $root, array $config, array $params): array
{
    if (!isset($params['cid'])) {
        throw new AgentError('CID_REQUIRED', 'posts.publish requires cid.');
    }

    $cid = (int) $params['cid'];
    $pdo = openWritePdo($config);
    $prefix = safePrefix($config['prefix']);
    $existing = fetchPostRow($pdo, $prefix, $cid);
    if (!$existing) {
        throw new AgentError('POST_NOT_FOUND', "Post {$cid} was not found.", false);
    }

    $now = time();
    $statement = $pdo->prepare(
        "UPDATE {$prefix}contents SET status = 'publish', modified = :modified WHERE cid = :cid"
    );
    $statement->execute([
        ':modified' => $now,
        ':cid' => $cid,
    ]);

    return postsGet($root, $config, ['cid' => $cid]);
}

function mediaUpload(string $root, array $config, array $params): array
{
    $filename = sanitizeFilename((string) ($params['filename'] ?? ''));
    $base64 = (string) ($params['base64'] ?? '');

    if ($filename === '') {
        throw new AgentError('FILENAME_REQUIRED', 'media.upload requires filename.');
    }

    if ($base64 === '') {
        throw new AgentError('MEDIA_BODY_REQUIRED', 'media.upload requires base64.');
    }

    $binary = base64_decode($base64, true);
    if ($binary === false) {
        throw new AgentError('INVALID_BASE64', 'media.upload base64 is invalid.');
    }

    $date = $params['date'] ?? date('Ym');
    if (!preg_match('/^\d{6}$/', (string) $date)) {
        $date = date('Ym');
    }

    $uploadDir = $root . '/usr/uploads/' . $date;
    if (!is_dir($uploadDir) && !mkdir($uploadDir, 0755, true) && !is_dir($uploadDir)) {
        throw new AgentError('UPLOAD_DIR_FAILED', "Could not create upload directory: {$uploadDir}");
    }

    $target = uniqueUploadPath($uploadDir, $filename);
    if (file_put_contents($target, $binary) === false) {
        throw new AgentError('UPLOAD_WRITE_FAILED', "Could not write upload: {$target}");
    }

    $options = readOptions($config);
    $siteUrl = rtrim((string) ($options['siteUrl'] ?? ''), '/');
    $relative = '/usr/uploads/' . $date . '/' . basename($target);
    $mime = mime_content_type($target) ?: 'application/octet-stream';
    $extension = strtolower(pathinfo($target, PATHINFO_EXTENSION));
    $pdo = openWritePdo($config);
    $prefix = safePrefix($config['prefix']);
    $now = time();
    $authorId = defaultAuthorId($pdo, $prefix);
    $attachment = serialize([
        'name' => basename($target),
        'path' => $relative,
        'size' => strlen($binary),
        'type' => $extension,
        'mime' => $mime,
    ]);
    $statement = $pdo->prepare(
        "INSERT INTO {$prefix}contents
         (title, slug, created, modified, text, \"order\", authorId, template, type, status, password, commentsNum, allowComment, allowPing, allowFeed, parent)
         VALUES
         (:title, :slug, :created, :modified, :text, 0, :authorId, NULL, 'attachment', 'publish', NULL, 0, '0', '0', '0', 0)"
    );
    $statement->execute([
        ':title' => basename($target),
        ':slug' => normalizeSlug(basename($target)),
        ':created' => $now,
        ':modified' => $now,
        ':text' => $attachment,
        ':authorId' => $authorId,
    ]);
    $cid = (int) $pdo->lastInsertId();

    return [
        'media' => [
            'cid' => $cid,
            'filename' => basename($target),
            'path' => $target,
            'relativePath' => $relative,
            'url' => $siteUrl !== '' ? $siteUrl . $relative : $relative,
            'size' => strlen($binary),
            'mime' => $mime,
        ],
        'markdown' => '![' . pathinfo($target, PATHINFO_FILENAME) . '](' . ($siteUrl !== '' ? $siteUrl . $relative : $relative) . ')',
    ];
}

function mediaList(string $root, array $config, array $params): array
{
    $limit = (int) ($params['limit'] ?? 20);
    $limit = max(1, min(100, $limit));
    $pdo = openReadOnlyPdo($config);
    $prefix = safePrefix($config['prefix']);
    $options = readOptions($config);
    $siteUrl = rtrim((string) ($options['siteUrl'] ?? ''), '/');
    $statement = $pdo->prepare(
        "SELECT cid, title, slug, created, modified, text, status, authorId
         FROM {$prefix}contents
         WHERE type = 'attachment'
         ORDER BY created DESC
         LIMIT :limit"
    );
    $statement->bindValue(':limit', $limit, PDO::PARAM_INT);
    $statement->execute();

    $media = [];
    foreach ($statement->fetchAll(PDO::FETCH_ASSOC) as $row) {
        $payload = @unserialize((string) $row['text']);
        $relative = is_array($payload) ? (string) ($payload['path'] ?? '') : '';
        $media[] = [
            'cid' => (int) $row['cid'],
            'title' => $row['title'],
            'filename' => is_array($payload) ? ($payload['name'] ?? $row['title']) : $row['title'],
            'relativePath' => $relative,
            'url' => $relative !== '' && $siteUrl !== '' ? $siteUrl . $relative : $relative,
            'size' => is_array($payload) ? (int) ($payload['size'] ?? 0) : 0,
            'mime' => is_array($payload) ? ($payload['mime'] ?? null) : null,
            'created' => timestampToIso($row['created']),
            'modified' => timestampToIso($row['modified']),
        ];
    }

    return [
        'site' => siteInfo($root, $config),
        'media' => $media,
    ];
}

function taxonomyList(string $root, array $config): array
{
    $pdo = openReadOnlyPdo($config);
    $prefix = safePrefix($config['prefix']);
    $statement = $pdo->query(
        "SELECT mid, name, slug, type, count, parent
         FROM {$prefix}metas
         WHERE type IN ('category', 'tag')
         ORDER BY type, name"
    );
    $categories = [];
    $tags = [];

    foreach ($statement->fetchAll(PDO::FETCH_ASSOC) as $row) {
        $item = [
            'mid' => (int) $row['mid'],
            'name' => $row['name'],
            'slug' => $row['slug'],
            'count' => (int) $row['count'],
            'parent' => (int) $row['parent'],
        ];

        if ($row['type'] === 'category') {
            $categories[] = $item;
        } else {
            $tags[] = $item;
        }
    }

    return [
        'site' => siteInfo($root, $config),
        'categories' => $categories,
        'tags' => $tags,
    ];
}

function readOptions(array $config): array
{
    try {
        $pdo = openReadOnlyPdo($config);
        $prefix = safePrefix($config['prefix']);
        $statement = $pdo->query("SELECT name, value FROM {$prefix}options");
        $options = [];

        foreach ($statement->fetchAll(PDO::FETCH_ASSOC) as $row) {
            $options[$row['name']] = $row['value'];
        }

        return $options;
    } catch (Throwable) {
        return [];
    }
}

function openReadOnlyPdo(array $config): PDO
{
    if (databaseKind($config) !== 'sqlite') {
        throw unsupportedDatabaseError($config, 'read');
    }

    if (!$config['dbFile'] || !is_file($config['dbFile'])) {
        throw new AgentError('SQLITE_DB_NOT_FOUND', 'SQLite database file was not found.');
    }

    $pdo = new PDO('sqlite:' . $config['dbFile'], null, null, [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
    ]);
    $pdo->query('PRAGMA query_only = ON');

    return $pdo;
}

function openWritePdo(array $config): PDO
{
    if (databaseKind($config) !== 'sqlite') {
        throw unsupportedDatabaseError($config, 'write');
    }

    if (!$config['dbFile'] || !is_file($config['dbFile'])) {
        throw new AgentError('SQLITE_DB_NOT_FOUND', 'SQLite database file was not found.');
    }

    return new PDO('sqlite:' . $config['dbFile'], null, null, [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
    ]);
}

function databaseKind(array $config): string
{
    $adapter = strtolower((string) ($config['adapter'] ?? ''));

    if (str_contains($adapter, 'sqlite')) {
        return 'sqlite';
    }

    if (str_contains($adapter, 'mysql')) {
        return 'mysql';
    }

    if (str_contains($adapter, 'pgsql')) {
        return 'pgsql';
    }

    return 'unknown';
}

function supportedDatabaseKinds(): array
{
    return ['sqlite'];
}

function databaseCompatibility(array $config): array
{
    $kind = databaseKind($config);
    $supported = in_array($kind, supportedDatabaseKinds(), true);

    return [
        'status' => $supported ? 'supported' : 'unsupported',
        'supported' => $supported,
        'readSupported' => $supported,
        'writeSupported' => $supported,
        'supportedKinds' => supportedDatabaseKinds(),
        'message' => $supported
            ? 'SQLite read/write access is available.'
            : unsupportedDatabaseMessage($config, 'read/write'),
    ];
}

function operationCapabilities(array $config): array
{
    $database = databaseCompatibility($config);

    return [
        'database' => $database,
        'postsRead' => $database['readSupported'],
        'postsWrite' => $database['writeSupported'],
        'mediaRead' => $database['readSupported'],
        'mediaWrite' => $database['writeSupported'],
        'taxonomyRead' => $database['readSupported'],
    ];
}

function unsupportedDatabaseError(array $config, string $operation): AgentError
{
    return new AgentError(
        'DATABASE_NOT_SUPPORTED',
        unsupportedDatabaseMessage($config, $operation),
        false,
        [
            'adapter' => $config['adapter'],
            'kind' => databaseKind($config),
            'operation' => $operation,
            'supportedKinds' => supportedDatabaseKinds(),
        ]
    );
}

function unsupportedDatabaseMessage(array $config, string $operation): string
{
    $kind = databaseKind($config);
    $adapter = $config['adapter'] ?: 'unknown';
    $supported = implode(', ', supportedDatabaseKinds());

    return "Database {$operation} operation is not supported for {$kind} (adapter: {$adapter}). Supported database kinds: {$supported}.";
}

function safePrefix(string $prefix): string
{
    if (!preg_match('/^[A-Za-z0-9_]+$/', $prefix)) {
        throw new AgentError('INVALID_TABLE_PREFIX', 'Database table prefix contains unsupported characters.');
    }

    return $prefix;
}

function normalizePostSummary(array $row): array
{
    return [
        'cid' => (int) $row['cid'],
        'title' => $row['title'],
        'slug' => $row['slug'],
        'created' => timestampToIso($row['created']),
        'modified' => timestampToIso($row['modified']),
        'status' => $row['status'],
        'type' => $row['type'],
        'authorId' => (int) $row['authorId'],
        'commentsNum' => (int) $row['commentsNum'],
    ];
}

function normalizePost(array $row, array $terms): array
{
    $post = normalizePostSummary($row);
    $post['text'] = $row['text'];
    $post['allowComment'] = (bool) $row['allowComment'];
    $post['allowPing'] = (bool) $row['allowPing'];
    $post['allowFeed'] = (bool) $row['allowFeed'];
    $post['categories'] = [];
    $post['tags'] = [];

    foreach ($terms as $term) {
        if ($term['type'] === 'category') {
            $post['categories'][] = $term['name'];
        }

        if ($term['type'] === 'tag') {
            $post['tags'][] = $term['name'];
        }
    }

    return $post;
}

function fetchPostRow(PDO $pdo, string $prefix, int $cid): ?array
{
    $statement = $pdo->prepare("SELECT * FROM {$prefix}contents WHERE cid = :cid LIMIT 1");
    $statement->bindValue(':cid', $cid, PDO::PARAM_INT);
    $statement->execute();
    $row = $statement->fetch(PDO::FETCH_ASSOC);

    return $row ?: null;
}

function defaultAuthorId(PDO $pdo, string $prefix): int
{
    $statement = $pdo->query("SELECT uid FROM {$prefix}users WHERE \"group\" = 'administrator' ORDER BY uid ASC LIMIT 1");
    $uid = $statement->fetchColumn();

    if ($uid === false) {
        $uid = $pdo->query("SELECT uid FROM {$prefix}users ORDER BY uid ASC LIMIT 1")->fetchColumn();
    }

    return $uid === false ? 1 : (int) $uid;
}

function normalizeMarkdownText(string $markdown): string
{
    return str_starts_with($markdown, '<!--markdown-->') ? $markdown : '<!--markdown-->' . $markdown;
}

function normalizeSlug(string $value): string
{
    $value = trim($value);
    if ($value === '') {
        return (string) time();
    }

    $slug = strtolower($value);
    $slug = preg_replace('/[^\p{L}\p{N}_-]+/u', '-', $slug) ?: '';
    $slug = trim($slug, '-');

    return $slug !== '' ? mb_substr($slug, 0, 150) : (string) time();
}

function applyTaxonomy(PDO $pdo, string $prefix, int $cid, mixed $categories, mixed $tags): void
{
    $categoryNames = normalizeNameList($categories);
    $tagNames = normalizeNameList($tags);
    $existingMids = $pdo->prepare("SELECT mid FROM {$prefix}relationships WHERE cid = :cid");
    $existingMids->execute([':cid' => $cid]);

    $pdo->prepare("DELETE FROM {$prefix}relationships WHERE cid = :cid")->execute([':cid' => $cid]);
    foreach ($existingMids->fetchAll(PDO::FETCH_ASSOC) as $row) {
        $pdo->prepare("UPDATE {$prefix}metas SET count = CASE WHEN count > 0 THEN count - 1 ELSE 0 END WHERE mid = :mid")
            ->execute([':mid' => (int) $row['mid']]);
    }

    foreach ($categoryNames as $name) {
        attachMeta($pdo, $prefix, $cid, ensureMeta($pdo, $prefix, $name, 'category'));
    }

    foreach ($tagNames as $name) {
        attachMeta($pdo, $prefix, $cid, ensureMeta($pdo, $prefix, $name, 'tag'));
    }
}

function normalizeNameList(mixed $value): array
{
    if (!is_array($value)) {
        return [];
    }

    $names = [];
    foreach ($value as $item) {
        $name = trim((string) $item);
        if ($name !== '') {
            $names[$name] = true;
        }
    }

    return array_keys($names);
}

function ensureMeta(PDO $pdo, string $prefix, string $name, string $type): int
{
    $statement = $pdo->prepare("SELECT mid FROM {$prefix}metas WHERE name = :name AND type = :type LIMIT 1");
    $statement->execute([
        ':name' => $name,
        ':type' => $type,
    ]);
    $mid = $statement->fetchColumn();
    if ($mid !== false) {
        return (int) $mid;
    }

    $insert = $pdo->prepare(
        "INSERT INTO {$prefix}metas (name, slug, type, description, count, \"order\", parent)
         VALUES (:name, :slug, :type, NULL, 0, 0, 0)"
    );
    $insert->execute([
        ':name' => $name,
        ':slug' => normalizeSlug($name),
        ':type' => $type,
    ]);

    return (int) $pdo->lastInsertId();
}

function attachMeta(PDO $pdo, string $prefix, int $cid, int $mid): void
{
    $pdo->prepare("INSERT INTO {$prefix}relationships (cid, mid) VALUES (:cid, :mid)")
        ->execute([':cid' => $cid, ':mid' => $mid]);
    $pdo->prepare("UPDATE {$prefix}metas SET count = count + 1 WHERE mid = :mid")
        ->execute([':mid' => $mid]);
}

function currentTerms(PDO $pdo, string $prefix, int $cid, string $type): array
{
    $statement = $pdo->prepare(
        "SELECT m.name
         FROM {$prefix}metas m
         INNER JOIN {$prefix}relationships r ON r.mid = m.mid
         WHERE r.cid = :cid AND m.type = :type"
    );
    $statement->execute([
        ':cid' => $cid,
        ':type' => $type,
    ]);

    return array_map(static fn (array $row): string => $row['name'], $statement->fetchAll(PDO::FETCH_ASSOC));
}

function truthyFlag(mixed $value): string
{
    return filter_var($value, FILTER_VALIDATE_BOOL) ? '1' : '0';
}

function sanitizeFilename(string $filename): string
{
    $base = basename($filename);
    $base = preg_replace('/[^A-Za-z0-9._-]+/', '-', $base) ?: '';
    $base = trim($base, '.-');

    return $base;
}

function uniqueUploadPath(string $dir, string $filename): string
{
    $info = pathinfo($filename);
    $name = $info['filename'] ?? 'upload';
    $extension = isset($info['extension']) ? '.' . $info['extension'] : '';
    $path = $dir . '/' . $name . $extension;
    $counter = 1;

    while (file_exists($path)) {
        $path = $dir . '/' . $name . '-' . $counter . $extension;
        $counter++;
    }

    return $path;
}

function timestampToIso(mixed $value): ?string
{
    if ($value === null || $value === '') {
        return null;
    }

    return gmdate('c', (int) $value);
}

function respondResult(mixed $id, array $result): void
{
    echo json_encode([
        'jsonrpc' => '2.0',
        'id' => $id,
        'result' => $result,
    ], JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE) . PHP_EOL;
}

function respondError(mixed $id, string $code, string $message, bool $retryable = false, array $details = []): void
{
    $error = [
        'code' => $code,
        'message' => $message,
        'retryable' => $retryable,
    ];

    if ($details !== []) {
        $error['details'] = $details;
    }

    echo json_encode([
        'jsonrpc' => '2.0',
        'id' => $id,
        'error' => $error,
    ], JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE) . PHP_EOL;
}

final class AgentError extends RuntimeException
{
    public string $codeName;
    public bool $retryable;
    public array $details;

    public function __construct(string $codeName, string $message, bool $retryable = false, array $details = [])
    {
        parent::__construct($message);
        $this->codeName = $codeName;
        $this->retryable = $retryable;
        $this->details = $details;
    }
}
