<?php
define('__TYPECHO_ROOT_DIR__', __DIR__);
$db = new Typecho\Db('Mysql', 'blog_');
$db->addServer([
    'host' => '127.0.0.1',
    'database' => 'typecho_fixture',
], Typecho\Db::READ | Typecho\Db::WRITE);
