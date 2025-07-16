-- extend user table to add role and settings
alter table users add column "role" TEXT not null default 'user';
alter table users add column "settings" TEXT null;

alter table messages add column "json_content" TEXT null;
alter table messages add column "metadata" TEXT null;


    