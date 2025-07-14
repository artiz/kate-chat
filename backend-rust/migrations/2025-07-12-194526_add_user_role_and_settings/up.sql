-- extend user table to add role and settings
alter table users add column "role" text not null default 'user';
alter table users add column "settings" text not null default '{}';

alter table messages add column "jsonContent" text null;
alter table messages add column "metadata" text null;


    