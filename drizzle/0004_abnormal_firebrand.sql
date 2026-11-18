CREATE INDEX `expenses_created_idx` ON `expenses` (`created`);--> statement-breakpoint
CREATE INDEX `orders_created_idx` ON `orders` (`created`);--> statement-breakpoint
CREATE INDEX `orders_phone_idx` ON `orders` (`phone`);--> statement-breakpoint
CREATE INDEX `payments_order_id_idx` ON `payments` (`order_id`);--> statement-breakpoint
CREATE INDEX `payments_created_idx` ON `payments` (`created`);