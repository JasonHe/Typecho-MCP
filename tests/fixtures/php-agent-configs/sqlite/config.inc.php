<?php
define('__TYPECHO_ROOT_DIR__', __DIR__);
$db = new Typecho\Db('SQLite', 'typecho_');
$db->addServer([
    'file' => './usr/typecho.db',
], Typecho\Db::READ | Typecho\Db::WRITE);
