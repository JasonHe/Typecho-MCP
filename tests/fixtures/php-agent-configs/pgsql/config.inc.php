<?php
define('__TYPECHO_ROOT_DIR__', __DIR__);
$db = new Typecho\Db('Pgsql', 'pg_');
$db->addServer([
    'host' => 'localhost',
    'database' => 'typecho_fixture',
], Typecho\Db::READ | Typecho\Db::WRITE);
