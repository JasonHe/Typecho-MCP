<?php
define('__TYPECHO_ROOT_DIR__', __DIR__);
$db = new Typecho\Db('Pdo_Mysql', 'pdo_');
$db->addServer([
    'host' => 'localhost',
    'database' => 'typecho_fixture',
], Typecho\Db::READ | Typecho\Db::WRITE);
