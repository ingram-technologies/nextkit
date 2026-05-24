-- @ingram-tech/newsletter — OPTIONAL auth-linking add-on.
--
-- Apply this ONLY on sites that have user signups and want a subscription made
-- before signup (e.g. a blog-footer signup) to be back-linked to the user when
-- they later create an account with the same email. Requires 0001 first.
--
-- Marketing sites without auth should NOT apply this.

create or replace function "public"."link_newsletter_subscriptions_on_signup" () returns "trigger" language "plpgsql" security definer set "search_path" to '' as $$
begin
	update public.newsletter_subscriptions
	set user_id = new.id
	where user_id is null
		and email = lower(new.email);
	return new;
end;
$$;

drop trigger if exists "link_newsletter_subscriptions_on_signup" on "auth"."users";
create trigger "link_newsletter_subscriptions_on_signup"
after insert on "auth"."users" for each row
execute function "public"."link_newsletter_subscriptions_on_signup" ();
