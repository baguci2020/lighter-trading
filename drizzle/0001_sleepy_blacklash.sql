CREATE TABLE `exchange_accounts` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`exchangeType` varchar(32) NOT NULL DEFAULT 'lighter',
	`label` varchar(128) NOT NULL,
	`accountIndex` varchar(64),
	`apiKeyIndex` varchar(16),
	`l1Address` varchar(64),
	`encryptedApiKey` text,
	`encryptedPrivateKey` text,
	`isActive` boolean NOT NULL DEFAULT true,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `exchange_accounts_id` PRIMARY KEY(`id`)
);
