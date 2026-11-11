-- Production baseline: schema-only snapshot of the live `public` schema
-- (pg_dump --schema-only --schema=public, PostgreSQL 15.8, taken 2026-11-11)
-- plus the auth.users signup trigger, which lives in the `auth` schema and so
-- is not in a public-only dump.
--
-- Every later migration predates this snapshot and was written against an
-- older schema, so they are idempotent re-applications on top of it; the final
-- reconcile migration removes the objects they recreate that production no
-- longer has. A fresh `supabase db reset` therefore ends at production's schema.
--
-- Local-only edits to the raw dump: CREATE SCHEMA → IF NOT EXISTS (Supabase
-- creates `public`); the `ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin`
-- lines are dropped (only supabase_admin may run them, and Supabase already sets
-- them); session settings are reset at the end so later migrations
-- run with the normal search_path.

--
-- PostgreSQL database dump
--

-- Dumped from database version 15.8
-- Dumped by pg_dump version 15.8

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: public; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA IF NOT EXISTS public;


--
-- Name: SCHEMA public; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON SCHEMA public IS 'standard public schema';


--
-- Name: author_id_by_email(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.author_id_by_email(p_email text) RETURNS uuid
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO 'public', 'auth'
    AS $$ SELECT id FROM auth.users WHERE lower(email) = lower(trim(p_email)) LIMIT 1; $$;


--
-- Name: can_access_note_live(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.can_access_note_live(p_note_id uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select p_note_id is not null
     and exists (select 1 from public.notes n where n.id = p_note_id and n.deleted_at is null)
     and (
          exists (select 1 from public.notes n
                   where n.id = p_note_id and n.author = (select auth.uid()))
       or exists (select 1 from public.shared_notes sn
                    join public.shared_notes_readers r on r.shared_note = sn.id
                   where sn.note_id = p_note_id and r.reader_id = (select auth.uid())::text)
       or exists (select 1 from public.shared_notes sn
                   where sn.note_id = p_note_id and sn.is_public = true)
     );
$$;


--
-- Name: create_author_with_random_username(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.create_author_with_random_username(user_id uuid) RETURNS json
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
  DECLARE
    new_username TEXT;
    result JSON;
    attempts INT := 0;
  BEGIN
    SELECT json_build_object('id', id, 'username', username) INTO result
    FROM public.authors WHERE id = user_id;
    IF result IS NOT NULL THEN
      RETURN result;
    END IF;

    LOOP
      attempts := attempts + 1;
      new_username := public.generate_random_username();
      BEGIN
        INSERT INTO public.authors (id, username) VALUES (user_id,
  new_username);
        EXIT;
      EXCEPTION
        WHEN unique_violation THEN
          IF EXISTS (SELECT 1 FROM public.authors WHERE id = user_id)
  THEN
            EXIT;
          END IF;
          IF attempts >= 10 THEN
            INSERT INTO public.authors (id, username)
            VALUES (user_id, new_username || substr(user_id::text, 1,
  8))
            ON CONFLICT (id) DO NOTHING;
            EXIT;
          END IF;
      END;
    END LOOP;

    SELECT json_build_object('id', id, 'username', username) INTO result
    FROM public.authors WHERE id = user_id;
    RETURN result;
  END;
  $$;


--
-- Name: generate_random_username(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.generate_random_username() RETURNS text
    LANGUAGE plpgsql
    AS $$
  DECLARE
    adjectives TEXT[] := ARRAY[
      'Joyful','Bold','Brilliant','Whimsical','Legendary','Curious','Rad
  iant','Serene',
      'Clever','Epic','Noble','Poetic','Magical','Vibrant','Peaceful','G
  entle',
      'Mysterious','Graceful','Energetic','Fearless','Ancient','Cosmic',
  'Enchanted',
      'Majestic','Thoughtful','Inspired','Passionate','Adventurous'];
    nouns TEXT[] := ARRAY[
      'Manuscript','Chronicle','Chronicler','Scroll','Parchment','Journa
  l','Novel','Poet',
      'Author','Scribe','Storyteller','Bard','Muse','Page','Quill','Penm
  an','Novelist',
      'Writer','Diary','Haven','Library','Tale','Text','Soul','Voice','G
  arden','Mind','Heart'];
  BEGIN
    RETURN adjectives[floor(random() * array_length(adjectives, 1) +
  1)::int]
      || nouns[floor(random() * array_length(nouns, 1) + 1)::int]
      || lpad(floor(random() * 10000)::int::text, 4, '0');
  END;
  $$;


--
-- Name: handle_new_user(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.handle_new_user() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
BEGIN
  PERFORM public.create_author_with_random_username(NEW.id);
  RETURN NEW;
END;
$$;


--
-- Name: increment_view_count(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.increment_view_count(shortcode_param text) RETURNS integer
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE
  new_count INTEGER;
BEGIN
  UPDATE public.shared_notes
  SET view_count = COALESCE(view_count, 0) + 1
  WHERE shortcode = shortcode_param
  RETURNING view_count INTO new_count;

  RETURN COALESCE(new_count, 0);
END;
$$;


--
-- Name: is_note_chat_participant(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.is_note_chat_participant(p_note_id uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.notes n
    WHERE n.id = p_note_id AND n.author = (select auth.uid())
  ) OR EXISTS (
    SELECT 1
    FROM public.shared_notes sn
    JOIN public.shared_notes_readers r ON r.shared_note = sn.id
    -- shared_notes_readers.reader_id is TEXT (not uuid), so compare as text.
    WHERE sn.note_id = p_note_id AND r.reader_id = (select auth.uid())::text
  );
$$;


--
-- Name: note_chat_reply_same_note(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.note_chat_reply_same_note() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  IF NEW.reply_to IS NOT NULL
     AND NOT EXISTS (
       SELECT 1 FROM public.note_chat_messages p
       WHERE p.id = NEW.reply_to AND p.note_id = NEW.note_id
     ) THEN
    RAISE EXCEPTION 'reply_to must reference a message in the same note';
  END IF;
  RETURN NEW;
END;
$$;


--
-- Name: realtime_note_id(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.realtime_note_id(p_prefix text) RETURNS uuid
    LANGUAGE sql STABLE
    SET search_path TO 'public', 'realtime'
    AS $_$
  select case
    when realtime.topic() ~ ('^' || p_prefix ||
         ':[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$')
    then substring(realtime.topic() from length(p_prefix) + 2)::uuid
    else null
  end;
$_$;


--
-- Name: roadmap_sync_vote_count(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.roadmap_sync_vote_count() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE roadmap_items SET vote_count = vote_count + 1, updated_at = now() WHERE id = NEW.item_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE roadmap_items SET vote_count = GREATEST(0, vote_count - 1), updated_at = now() WHERE id = OLD.item_id;
  END IF;
  RETURN NULL;
END;
$$;


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: account_deletions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.account_deletions (
    user_id uuid NOT NULL,
    requested_at timestamp with time zone DEFAULT now() NOT NULL,
    purge_at timestamp with time zone NOT NULL,
    stripe_canceled boolean DEFAULT false NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    CONSTRAINT account_deletions_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'purging'::text, 'done'::text])))
);


--
-- Name: account_exports; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.account_exports (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    storage_key text,
    size_bytes bigint,
    error text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    expires_at timestamp with time zone,
    format text DEFAULT 'json'::text NOT NULL,
    anon_id text,
    CONSTRAINT account_exports_format_check CHECK ((format = ANY (ARRAY['json'::text, 'markdown_zip'::text]))),
    CONSTRAINT account_exports_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'processing'::text, 'ready'::text, 'failed'::text, 'expired'::text])))
);


--
-- Name: authors; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.authors (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    username text,
    avatar_url text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    last_active_at timestamp with time zone,
    redis_user_id text,
    role integer DEFAULT 3 NOT NULL
);


--
-- Name: collections; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.collections (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    owner uuid,
    name text,
    shortcode text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: collections_notes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.collections_notes (
    id integer NOT NULL,
    collection_id uuid DEFAULT gen_random_uuid() NOT NULL,
    note_id uuid
);


--
-- Name: collections_notes_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.collections_notes_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: collections_notes_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.collections_notes_id_seq OWNED BY public.collections_notes.id;


--
-- Name: note_chat_message_versions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.note_chat_message_versions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    message_id uuid NOT NULL,
    body text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: note_chat_messages; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.note_chat_messages (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    note_id uuid NOT NULL,
    author_id uuid,
    kind text DEFAULT 'text'::text NOT NULL,
    body text,
    reply_to uuid,
    anchor jsonb,
    media_key text,
    media_mime text,
    media_meta jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    edited_at timestamp with time zone,
    deleted_at timestamp with time zone,
    CONSTRAINT note_chat_messages_body_check CHECK (((body IS NULL) OR (char_length(body) <= 4000))),
    CONSTRAINT note_chat_messages_kind_check CHECK ((kind = ANY (ARRAY['text'::text, 'image'::text, 'gif'::text, 'audio'::text, 'system'::text])))
);


--
-- Name: note_chat_reads; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.note_chat_reads (
    note_id uuid NOT NULL,
    user_id uuid NOT NULL,
    last_read_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: note_tags; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.note_tags (
    note_id uuid NOT NULL,
    tag_id uuid NOT NULL
);


--
-- Name: note_versions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.note_versions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    note_id uuid NOT NULL,
    author uuid NOT NULL,
    title text,
    content text,
    content_format text DEFAULT 'markdown'::text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    reason text DEFAULT 'autosave'::text NOT NULL,
    note_version integer
);


--
-- Name: note_ydoc; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.note_ydoc (
    note_id uuid NOT NULL,
    state text NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: notebooks; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.notebooks (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    owner uuid NOT NULL,
    name text NOT NULL,
    cover_type text DEFAULT 'color'::text NOT NULL,
    cover_value text DEFAULT '#6366f1'::text NOT NULL,
    display_order integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    word_goal integer DEFAULT 0,
    parent_id uuid,
    is_hidden boolean DEFAULT false NOT NULL,
    show_hidden_children boolean DEFAULT false NOT NULL,
    colour text DEFAULT 'violet'::text NOT NULL,
    cover jsonb DEFAULT '{"type": "gradient"}'::jsonb NOT NULL,
    description text,
    goal jsonb,
    is_private boolean DEFAULT false NOT NULL,
    is_published boolean DEFAULT false NOT NULL,
    sort_index integer DEFAULT 0 NOT NULL,
    CONSTRAINT notebooks_colour_chk CHECK ((colour = ANY (ARRAY['violet'::text, 'violet-light'::text, 'blue'::text, 'indigo'::text, 'pink'::text, 'green'::text]))),
    CONSTRAINT notebooks_description_len_chk CHECK (((description IS NULL) OR (char_length(description) <= 280))),
    CONSTRAINT notebooks_goal_chk CHECK (((goal IS NULL) OR (((goal ->> 'type'::text) = ANY (ARRAY['daily'::text, 'total'::text])) AND (jsonb_typeof((goal -> 'target'::text)) = 'number'::text) AND (((goal ->> 'target'::text))::numeric > (0)::numeric)))),
    CONSTRAINT notebooks_name_len_chk CHECK ((char_length(name) <= 80))
);


--
-- Name: notes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.notes (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    author uuid,
    title text,
    content text,
    is_pinned boolean DEFAULT false,
    is_private boolean DEFAULT false,
    is_collapsed boolean DEFAULT false,
    "order" integer DEFAULT 0,
    goal integer,
    goal_type text,
    notebook_id uuid,
    content_format text DEFAULT 'html'::text,
    content_html_backup text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone,
    deleted_at timestamp with time zone,
    version integer DEFAULT 1 NOT NULL
);


--
-- Name: notifications; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.notifications (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    type text NOT NULL,
    actor_id uuid,
    note_id uuid,
    data jsonb,
    read_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: roadmap_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.roadmap_items (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    title text NOT NULL,
    body text DEFAULT ''::text NOT NULL,
    status text DEFAULT 'under_review'::text NOT NULL,
    source text DEFAULT 'community'::text NOT NULL,
    is_public boolean DEFAULT false NOT NULL,
    vote_count integer DEFAULT 0 NOT NULL,
    created_by uuid,
    sort_order integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    category text,
    CONSTRAINT roadmap_items_category_check CHECK ((category = ANY (ARRAY['fix'::text, 'feature'::text]))),
    CONSTRAINT roadmap_items_source_check CHECK ((source = ANY (ARRAY['official'::text, 'community'::text]))),
    CONSTRAINT roadmap_items_status_check CHECK ((status = ANY (ARRAY['under_review'::text, 'planned'::text, 'in_progress'::text, 'shipped'::text, 'declined'::text])))
);


--
-- Name: roadmap_votes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.roadmap_votes (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    item_id uuid NOT NULL,
    user_id uuid,
    voter_key text,
    ip text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: saved_shared_notes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.saved_shared_notes (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    shortcode text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    pinned boolean DEFAULT false NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL
);


--
-- Name: shared_note_tags; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.shared_note_tags (
    user_id uuid NOT NULL,
    shortcode text NOT NULL,
    tag_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: shared_notes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.shared_notes (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    note_id uuid NOT NULL,
    note_owner_id text NOT NULL,
    note_owner_id_old text,
    shortcode text NOT NULL,
    is_public boolean DEFAULT true,
    is_anonymous boolean DEFAULT false,
    password_hash text,
    storage text DEFAULT 'supabase'::text,
    view_count integer DEFAULT 0,
    expires_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    link_permission text DEFAULT 'view'::text NOT NULL,
    CONSTRAINT shared_notes_link_permission_check CHECK ((link_permission = ANY (ARRAY['off'::text, 'view'::text, 'edit'::text, 'published'::text])))
);


--
-- Name: shared_notes_analytics; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.shared_notes_analytics (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    shared_note uuid NOT NULL,
    analytics jsonb,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: shared_notes_readers; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.shared_notes_readers (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    shared_note uuid NOT NULL,
    reader_username text NOT NULL,
    reader_id text,
    view_count integer,
    first_viewed_at timestamp with time zone,
    last_viewed_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now(),
    role text DEFAULT 'view'::text NOT NULL,
    pinned boolean DEFAULT false NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL,
    hidden boolean DEFAULT false NOT NULL,
    CONSTRAINT shared_notes_readers_role_check CHECK ((role = ANY (ARRAY['view'::text, 'edit'::text])))
);


--
-- Name: subscriptions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.subscriptions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    tier text DEFAULT 'free'::text NOT NULL,
    status text DEFAULT 'active'::text NOT NULL,
    current_period_end timestamp with time zone,
    cancel_at_period_end boolean DEFAULT false,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    trash_retention_days integer DEFAULT 60 NOT NULL,
    plan_source text DEFAULT 'stripe'::text NOT NULL,
    comp_until timestamp with time zone,
    stripe_customer_id text,
    stripe_subscription_id text,
    CONSTRAINT subscriptions_plan_source_check CHECK ((plan_source = ANY (ARRAY['stripe'::text, 'manual'::text])))
);


--
-- Name: tags; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tags (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    owner uuid NOT NULL,
    name character varying(50) NOT NULL,
    color character varying(7) DEFAULT '#6366f1'::character varying NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: user_settings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_settings (
    user_id uuid NOT NULL,
    settings jsonb DEFAULT '{}'::jsonb NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT user_settings_settings_check CHECK ((pg_column_size(settings) < 16384))
);


--
-- Name: writing_sessions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.writing_sessions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    date date DEFAULT CURRENT_DATE NOT NULL,
    words_written integer DEFAULT 0 NOT NULL,
    duration_seconds integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: collections_notes id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.collections_notes ALTER COLUMN id SET DEFAULT nextval('public.collections_notes_id_seq'::regclass);


--
-- Name: account_deletions account_deletions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.account_deletions
    ADD CONSTRAINT account_deletions_pkey PRIMARY KEY (user_id);


--
-- Name: account_exports account_exports_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.account_exports
    ADD CONSTRAINT account_exports_pkey PRIMARY KEY (id);


--
-- Name: authors authors_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.authors
    ADD CONSTRAINT authors_pkey PRIMARY KEY (id);


--
-- Name: authors authors_username_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.authors
    ADD CONSTRAINT authors_username_key UNIQUE (username);


--
-- Name: collections_notes collections_notes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.collections_notes
    ADD CONSTRAINT collections_notes_pkey PRIMARY KEY (id);


--
-- Name: collections collections_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.collections
    ADD CONSTRAINT collections_pkey PRIMARY KEY (id);


--
-- Name: note_chat_message_versions note_chat_message_versions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.note_chat_message_versions
    ADD CONSTRAINT note_chat_message_versions_pkey PRIMARY KEY (id);


--
-- Name: note_chat_messages note_chat_messages_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.note_chat_messages
    ADD CONSTRAINT note_chat_messages_pkey PRIMARY KEY (id);


--
-- Name: note_chat_reads note_chat_reads_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.note_chat_reads
    ADD CONSTRAINT note_chat_reads_pkey PRIMARY KEY (note_id, user_id);


--
-- Name: note_tags note_tags_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.note_tags
    ADD CONSTRAINT note_tags_pkey PRIMARY KEY (note_id, tag_id);


--
-- Name: note_versions note_versions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.note_versions
    ADD CONSTRAINT note_versions_pkey PRIMARY KEY (id);


--
-- Name: note_ydoc note_ydoc_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.note_ydoc
    ADD CONSTRAINT note_ydoc_pkey PRIMARY KEY (note_id);


--
-- Name: notebooks notebooks_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notebooks
    ADD CONSTRAINT notebooks_pkey PRIMARY KEY (id);


--
-- Name: notes notes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notes
    ADD CONSTRAINT notes_pkey PRIMARY KEY (id);


--
-- Name: notifications notifications_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT notifications_pkey PRIMARY KEY (id);


--
-- Name: roadmap_items roadmap_items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.roadmap_items
    ADD CONSTRAINT roadmap_items_pkey PRIMARY KEY (id);


--
-- Name: roadmap_votes roadmap_votes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.roadmap_votes
    ADD CONSTRAINT roadmap_votes_pkey PRIMARY KEY (id);


--
-- Name: saved_shared_notes saved_shared_notes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.saved_shared_notes
    ADD CONSTRAINT saved_shared_notes_pkey PRIMARY KEY (id);


--
-- Name: saved_shared_notes saved_shared_notes_user_id_shortcode_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.saved_shared_notes
    ADD CONSTRAINT saved_shared_notes_user_id_shortcode_key UNIQUE (user_id, shortcode);


--
-- Name: shared_note_tags shared_note_tags_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.shared_note_tags
    ADD CONSTRAINT shared_note_tags_pkey PRIMARY KEY (user_id, shortcode, tag_id);


--
-- Name: shared_notes_analytics shared_notes_analytics_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.shared_notes_analytics
    ADD CONSTRAINT shared_notes_analytics_pkey PRIMARY KEY (id);


--
-- Name: shared_notes shared_notes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.shared_notes
    ADD CONSTRAINT shared_notes_pkey PRIMARY KEY (id);


--
-- Name: shared_notes_readers shared_notes_readers_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.shared_notes_readers
    ADD CONSTRAINT shared_notes_readers_pkey PRIMARY KEY (id);


--
-- Name: shared_notes shared_notes_shortcode_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.shared_notes
    ADD CONSTRAINT shared_notes_shortcode_key UNIQUE (shortcode);


--
-- Name: subscriptions subscriptions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.subscriptions
    ADD CONSTRAINT subscriptions_pkey PRIMARY KEY (id);


--
-- Name: subscriptions subscriptions_user_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.subscriptions
    ADD CONSTRAINT subscriptions_user_id_key UNIQUE (user_id);


--
-- Name: tags tags_owner_name_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tags
    ADD CONSTRAINT tags_owner_name_key UNIQUE (owner, name);


--
-- Name: tags tags_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tags
    ADD CONSTRAINT tags_pkey PRIMARY KEY (id);


--
-- Name: user_settings user_settings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_settings
    ADD CONSTRAINT user_settings_pkey PRIMARY KEY (user_id);


--
-- Name: writing_sessions writing_sessions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.writing_sessions
    ADD CONSTRAINT writing_sessions_pkey PRIMARY KEY (id);


--
-- Name: writing_sessions writing_sessions_user_id_date_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.writing_sessions
    ADD CONSTRAINT writing_sessions_user_id_date_key UNIQUE (user_id, date);


--
-- Name: account_deletions_due_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX account_deletions_due_idx ON public.account_deletions USING btree (status, purge_at);


--
-- Name: account_exports_expiry_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX account_exports_expiry_idx ON public.account_exports USING btree (expires_at);


--
-- Name: account_exports_user_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX account_exports_user_idx ON public.account_exports USING btree (user_id, created_at DESC);


--
-- Name: idx_note_tags_note_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_note_tags_note_id ON public.note_tags USING btree (note_id);


--
-- Name: idx_note_tags_tag_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_note_tags_tag_id ON public.note_tags USING btree (tag_id);


--
-- Name: idx_note_versions_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_note_versions_created ON public.note_versions USING btree (created_at DESC);


--
-- Name: idx_note_versions_note_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_note_versions_note_id ON public.note_versions USING btree (note_id);


--
-- Name: idx_notebooks_owner; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_notebooks_owner ON public.notebooks USING btree (owner);


--
-- Name: idx_notebooks_parent_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_notebooks_parent_id ON public.notebooks USING btree (parent_id);


--
-- Name: idx_notes_author; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_notes_author ON public.notes USING btree (author);


--
-- Name: idx_notes_content_format; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_notes_content_format ON public.notes USING btree (content_format);


--
-- Name: idx_notes_deleted_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_notes_deleted_at ON public.notes USING btree (deleted_at);


--
-- Name: idx_notes_notebook_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_notes_notebook_id ON public.notes USING btree (notebook_id);


--
-- Name: idx_shared_notes_note_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_shared_notes_note_id ON public.shared_notes USING btree (note_id);


--
-- Name: idx_shared_notes_shortcode; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_shared_notes_shortcode ON public.shared_notes USING btree (shortcode);


--
-- Name: idx_tags_owner; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_tags_owner ON public.tags USING btree (owner);


--
-- Name: idx_writing_sessions_user_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_writing_sessions_user_date ON public.writing_sessions USING btree (user_id, date);


--
-- Name: note_chat_message_versions_message_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX note_chat_message_versions_message_idx ON public.note_chat_message_versions USING btree (message_id, created_at);


--
-- Name: note_chat_messages_note_id_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX note_chat_messages_note_id_created_idx ON public.note_chat_messages USING btree (note_id, created_at);


--
-- Name: notifications_user_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX notifications_user_idx ON public.notifications USING btree (user_id, created_at DESC);


--
-- Name: notifications_user_note_type_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX notifications_user_note_type_idx ON public.notifications USING btree (user_id, note_id, type) WHERE (read_at IS NULL);


--
-- Name: roadmap_items_public_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX roadmap_items_public_idx ON public.roadmap_items USING btree (is_public, status, sort_order);


--
-- Name: roadmap_votes_guest_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX roadmap_votes_guest_unique ON public.roadmap_votes USING btree (item_id, voter_key) WHERE (voter_key IS NOT NULL);


--
-- Name: roadmap_votes_user_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX roadmap_votes_user_unique ON public.roadmap_votes USING btree (item_id, user_id) WHERE (user_id IS NOT NULL);


--
-- Name: saved_shared_notes_user_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX saved_shared_notes_user_idx ON public.saved_shared_notes USING btree (user_id);


--
-- Name: shared_note_tags_user_shortcode_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX shared_note_tags_user_shortcode_idx ON public.shared_note_tags USING btree (user_id, shortcode);


--
-- Name: subscriptions_stripe_subscription_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX subscriptions_stripe_subscription_id_idx ON public.subscriptions USING btree (stripe_subscription_id);


--
-- Name: note_chat_messages note_chat_reply_same_note_trg; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER note_chat_reply_same_note_trg BEFORE INSERT OR UPDATE ON public.note_chat_messages FOR EACH ROW EXECUTE FUNCTION public.note_chat_reply_same_note();


--
-- Name: roadmap_votes roadmap_votes_count; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER roadmap_votes_count AFTER INSERT OR DELETE ON public.roadmap_votes FOR EACH ROW EXECUTE FUNCTION public.roadmap_sync_vote_count();


--
-- Name: collections_notes collections_notes_collection_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.collections_notes
    ADD CONSTRAINT collections_notes_collection_id_fkey FOREIGN KEY (collection_id) REFERENCES public.collections(id);


--
-- Name: collections_notes collections_notes_note_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.collections_notes
    ADD CONSTRAINT collections_notes_note_id_fkey FOREIGN KEY (note_id) REFERENCES public.notes(id);


--
-- Name: collections collections_owner_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.collections
    ADD CONSTRAINT collections_owner_fkey FOREIGN KEY (owner) REFERENCES public.authors(id);


--
-- Name: note_chat_message_versions note_chat_message_versions_message_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.note_chat_message_versions
    ADD CONSTRAINT note_chat_message_versions_message_id_fkey FOREIGN KEY (message_id) REFERENCES public.note_chat_messages(id) ON DELETE CASCADE;


--
-- Name: note_chat_messages note_chat_messages_author_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.note_chat_messages
    ADD CONSTRAINT note_chat_messages_author_id_fkey FOREIGN KEY (author_id) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: note_chat_messages note_chat_messages_note_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.note_chat_messages
    ADD CONSTRAINT note_chat_messages_note_id_fkey FOREIGN KEY (note_id) REFERENCES public.notes(id) ON DELETE CASCADE;


--
-- Name: note_chat_messages note_chat_messages_reply_to_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.note_chat_messages
    ADD CONSTRAINT note_chat_messages_reply_to_fkey FOREIGN KEY (reply_to) REFERENCES public.note_chat_messages(id) ON DELETE SET NULL;


--
-- Name: note_chat_reads note_chat_reads_note_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.note_chat_reads
    ADD CONSTRAINT note_chat_reads_note_id_fkey FOREIGN KEY (note_id) REFERENCES public.notes(id) ON DELETE CASCADE;


--
-- Name: note_tags note_tags_note_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.note_tags
    ADD CONSTRAINT note_tags_note_id_fkey FOREIGN KEY (note_id) REFERENCES public.notes(id) ON DELETE CASCADE;


--
-- Name: note_tags note_tags_tag_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.note_tags
    ADD CONSTRAINT note_tags_tag_id_fkey FOREIGN KEY (tag_id) REFERENCES public.tags(id) ON DELETE CASCADE;


--
-- Name: note_ydoc note_ydoc_note_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.note_ydoc
    ADD CONSTRAINT note_ydoc_note_id_fkey FOREIGN KEY (note_id) REFERENCES public.notes(id) ON DELETE CASCADE;


--
-- Name: notebooks notebooks_parent_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notebooks
    ADD CONSTRAINT notebooks_parent_id_fkey FOREIGN KEY (parent_id) REFERENCES public.notebooks(id) ON DELETE SET NULL;


--
-- Name: notes notes_notebook_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notes
    ADD CONSTRAINT notes_notebook_id_fkey FOREIGN KEY (notebook_id) REFERENCES public.notebooks(id) ON DELETE SET NULL;


--
-- Name: notifications notifications_actor_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT notifications_actor_id_fkey FOREIGN KEY (actor_id) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: notifications notifications_note_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT notifications_note_id_fkey FOREIGN KEY (note_id) REFERENCES public.notes(id) ON DELETE CASCADE;


--
-- Name: notifications notifications_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT notifications_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: roadmap_votes roadmap_votes_item_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.roadmap_votes
    ADD CONSTRAINT roadmap_votes_item_id_fkey FOREIGN KEY (item_id) REFERENCES public.roadmap_items(id) ON DELETE CASCADE;


--
-- Name: shared_note_tags shared_note_tags_tag_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.shared_note_tags
    ADD CONSTRAINT shared_note_tags_tag_id_fkey FOREIGN KEY (tag_id) REFERENCES public.tags(id) ON DELETE CASCADE;


--
-- Name: shared_note_tags shared_note_tags_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.shared_note_tags
    ADD CONSTRAINT shared_note_tags_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: shared_notes_analytics shared_notes_analytics_shared_note_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.shared_notes_analytics
    ADD CONSTRAINT shared_notes_analytics_shared_note_fkey FOREIGN KEY (shared_note) REFERENCES public.shared_notes(id);


--
-- Name: shared_notes_readers shared_notes_readers_shared_note_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.shared_notes_readers
    ADD CONSTRAINT shared_notes_readers_shared_note_fkey FOREIGN KEY (shared_note) REFERENCES public.shared_notes(id);


--
-- Name: tags tags_owner_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tags
    ADD CONSTRAINT tags_owner_fkey FOREIGN KEY (owner) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: user_settings user_settings_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_settings
    ADD CONSTRAINT user_settings_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: writing_sessions writing_sessions_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.writing_sessions
    ADD CONSTRAINT writing_sessions_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: shared_notes Anyone can read public shared notes; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Anyone can read public shared notes" ON public.shared_notes FOR SELECT USING ((is_public = true));


--
-- Name: shared_notes_readers Note owners can view readers; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Note owners can view readers" ON public.shared_notes_readers FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.shared_notes s
  WHERE ((s.id = shared_notes_readers.shared_note) AND (s.note_owner_id = (auth.uid())::text)))));


--
-- Name: shared_notes Owner can CRUD shared notes; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Owner can CRUD shared notes" ON public.shared_notes USING (((auth.uid())::text = note_owner_id));


--
-- Name: shared_notes Owner can delete own shared notes; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Owner can delete own shared notes" ON public.shared_notes FOR DELETE USING (((auth.uid())::text = note_owner_id));


--
-- Name: shared_notes Owner can insert shared notes; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Owner can insert shared notes" ON public.shared_notes FOR INSERT WITH CHECK (((auth.uid())::text = note_owner_id));


--
-- Name: shared_notes_readers Owner can manage readers; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Owner can manage readers" ON public.shared_notes_readers USING ((auth.role() = 'service_role'::text));


--
-- Name: shared_notes Owner can read own shared notes; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Owner can read own shared notes" ON public.shared_notes FOR SELECT USING (((auth.uid())::text = note_owner_id));


--
-- Name: shared_notes Owner can update own shared notes; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Owner can update own shared notes" ON public.shared_notes FOR UPDATE USING (((auth.uid())::text = note_owner_id));


--
-- Name: roadmap_items Public can read published roadmap items; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Public can read published roadmap items" ON public.roadmap_items FOR SELECT USING ((is_public = true));


--
-- Name: shared_notes_readers Readers can view own access; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Readers can view own access" ON public.shared_notes_readers FOR SELECT USING ((reader_username = ( SELECT authors.username
   FROM public.authors
  WHERE (authors.id = auth.uid()))));


--
-- Name: authors Service role full access authors; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Service role full access authors" ON public.authors USING ((auth.role() = 'service_role'::text));


--
-- Name: notes Service role full access notes; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Service role full access notes" ON public.notes USING ((auth.role() = 'service_role'::text));


--
-- Name: saved_shared_notes Service role full access saved shares; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Service role full access saved shares" ON public.saved_shared_notes USING ((auth.role() = 'service_role'::text));


--
-- Name: shared_notes Service role full access shared notes; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Service role full access shared notes" ON public.shared_notes USING ((auth.role() = 'service_role'::text));


--
-- Name: subscriptions Service role full access subscriptions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Service role full access subscriptions" ON public.subscriptions USING ((auth.role() = 'service_role'::text));


--
-- Name: note_tags Service role full access to note_tags; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Service role full access to note_tags" ON public.note_tags TO service_role USING (true) WITH CHECK (true);


--
-- Name: shared_note_tags Service role full access to shared_note_tags; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Service role full access to shared_note_tags" ON public.shared_note_tags TO service_role USING (true) WITH CHECK (true);


--
-- Name: tags Service role full access to tags; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Service role full access to tags" ON public.tags TO service_role USING (true) WITH CHECK (true);


--
-- Name: writing_sessions Service role full access to writing_sessions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Service role full access to writing_sessions" ON public.writing_sessions TO service_role USING (true) WITH CHECK (true);


--
-- Name: roadmap_items Service role manages roadmap items; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Service role manages roadmap items" ON public.roadmap_items USING ((auth.role() = 'service_role'::text)) WITH CHECK ((auth.role() = 'service_role'::text));


--
-- Name: roadmap_votes Service role manages roadmap votes; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Service role manages roadmap votes" ON public.roadmap_votes USING ((auth.role() = 'service_role'::text)) WITH CHECK ((auth.role() = 'service_role'::text));


--
-- Name: notebooks Users can CRUD own notebooks; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can CRUD own notebooks" ON public.notebooks USING ((auth.uid() = owner));


--
-- Name: note_tags Users can add tags to own notes; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can add tags to own notes" ON public.note_tags FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM public.notes
  WHERE ((notes.id = note_tags.note_id) AND (notes.author = auth.uid())))));


--
-- Name: tags Users can create own tags; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can create own tags" ON public.tags FOR INSERT WITH CHECK ((auth.uid() = owner));


--
-- Name: notes Users can delete own notes; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can delete own notes" ON public.notes FOR DELETE USING (((auth.uid())::text = (author)::text));


--
-- Name: tags Users can delete own tags; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can delete own tags" ON public.tags FOR DELETE USING ((auth.uid() = owner));


--
-- Name: note_versions Users can delete own versions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can delete own versions" ON public.note_versions FOR DELETE USING ((auth.uid() = author));


--
-- Name: notes Users can insert own notes; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can insert own notes" ON public.notes FOR INSERT WITH CHECK (((auth.uid())::text = (author)::text));


--
-- Name: note_versions Users can insert own versions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can insert own versions" ON public.note_versions FOR INSERT WITH CHECK ((auth.uid() = author));


--
-- Name: writing_sessions Users can insert own writing sessions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can insert own writing sessions" ON public.writing_sessions FOR INSERT WITH CHECK ((auth.uid() = user_id));


--
-- Name: authors Users can read own author; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can read own author" ON public.authors FOR SELECT USING ((auth.uid() = id));


--
-- Name: notes Users can read own notes; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can read own notes" ON public.notes FOR SELECT USING (((auth.uid())::text = (author)::text));


--
-- Name: subscriptions Users can read own subscription; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can read own subscription" ON public.subscriptions FOR SELECT USING ((auth.uid() = user_id));


--
-- Name: note_versions Users can read own versions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can read own versions" ON public.note_versions FOR SELECT USING ((auth.uid() = author));


--
-- Name: note_tags Users can remove tags from own notes; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can remove tags from own notes" ON public.note_tags FOR DELETE USING ((EXISTS ( SELECT 1
   FROM public.notes
  WHERE ((notes.id = note_tags.note_id) AND (notes.author = auth.uid())))));


--
-- Name: authors Users can update own author; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update own author" ON public.authors FOR UPDATE USING ((auth.uid() = id));


--
-- Name: notes Users can update own notes; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update own notes" ON public.notes FOR UPDATE USING (((auth.uid())::text = (author)::text));


--
-- Name: tags Users can update own tags; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update own tags" ON public.tags FOR UPDATE USING ((auth.uid() = owner));


--
-- Name: writing_sessions Users can update own writing sessions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update own writing sessions" ON public.writing_sessions FOR UPDATE USING ((auth.uid() = user_id));


--
-- Name: tags Users can view own tags; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view own tags" ON public.tags FOR SELECT USING ((auth.uid() = owner));


--
-- Name: writing_sessions Users can view own writing sessions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view own writing sessions" ON public.writing_sessions FOR SELECT USING ((auth.uid() = user_id));


--
-- Name: note_tags Users can view tags on own notes; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view tags on own notes" ON public.note_tags FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.notes
  WHERE ((notes.id = note_tags.note_id) AND (notes.author = auth.uid())))));


--
-- Name: saved_shared_notes Users manage own saved shares; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users manage own saved shares" ON public.saved_shared_notes USING ((auth.uid() = user_id)) WITH CHECK ((auth.uid() = user_id));


--
-- Name: shared_note_tags Users manage own shared-note tags; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users manage own shared-note tags" ON public.shared_note_tags USING ((auth.uid() = user_id)) WITH CHECK ((auth.uid() = user_id));


--
-- Name: account_deletions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.account_deletions ENABLE ROW LEVEL SECURITY;

--
-- Name: account_deletions account_deletions_cancel; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY account_deletions_cancel ON public.account_deletions FOR DELETE USING (((user_id = ( SELECT auth.uid() AS uid)) AND (status = 'pending'::text)));


--
-- Name: account_deletions account_deletions_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY account_deletions_select ON public.account_deletions FOR SELECT USING ((user_id = ( SELECT auth.uid() AS uid)));


--
-- Name: account_exports; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.account_exports ENABLE ROW LEVEL SECURITY;

--
-- Name: account_exports account_exports_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY account_exports_select ON public.account_exports FOR SELECT USING ((user_id = ( SELECT auth.uid() AS uid)));


--
-- Name: authors; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.authors ENABLE ROW LEVEL SECURITY;

--
-- Name: collections; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.collections ENABLE ROW LEVEL SECURITY;

--
-- Name: collections_notes; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.collections_notes ENABLE ROW LEVEL SECURITY;

--
-- Name: note_chat_message_versions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.note_chat_message_versions ENABLE ROW LEVEL SECURITY;

--
-- Name: note_chat_message_versions note_chat_message_versions_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY note_chat_message_versions_select ON public.note_chat_message_versions FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.note_chat_messages m
  WHERE ((m.id = note_chat_message_versions.message_id) AND public.is_note_chat_participant(m.note_id)))));


--
-- Name: note_chat_messages; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.note_chat_messages ENABLE ROW LEVEL SECURITY;

--
-- Name: note_chat_messages note_chat_messages_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY note_chat_messages_select ON public.note_chat_messages FOR SELECT USING (public.is_note_chat_participant(note_id));


--
-- Name: note_chat_reads; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.note_chat_reads ENABLE ROW LEVEL SECURITY;

--
-- Name: note_chat_reads note_chat_reads_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY note_chat_reads_select ON public.note_chat_reads FOR SELECT USING ((user_id = ( SELECT auth.uid() AS uid)));


--
-- Name: note_chat_reads note_chat_reads_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY note_chat_reads_update ON public.note_chat_reads FOR UPDATE USING ((user_id = ( SELECT auth.uid() AS uid))) WITH CHECK (((user_id = ( SELECT auth.uid() AS uid)) AND public.is_note_chat_participant(note_id)));


--
-- Name: note_chat_reads note_chat_reads_upsert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY note_chat_reads_upsert ON public.note_chat_reads FOR INSERT WITH CHECK (((user_id = ( SELECT auth.uid() AS uid)) AND public.is_note_chat_participant(note_id)));


--
-- Name: note_tags; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.note_tags ENABLE ROW LEVEL SECURITY;

--
-- Name: note_versions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.note_versions ENABLE ROW LEVEL SECURITY;

--
-- Name: note_ydoc; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.note_ydoc ENABLE ROW LEVEL SECURITY;

--
-- Name: notebooks; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.notebooks ENABLE ROW LEVEL SECURITY;

--
-- Name: notes; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.notes ENABLE ROW LEVEL SECURITY;

--
-- Name: notifications; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

--
-- Name: notifications notifications_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY notifications_delete ON public.notifications FOR DELETE USING ((user_id = ( SELECT auth.uid() AS uid)));


--
-- Name: notifications notifications_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY notifications_select ON public.notifications FOR SELECT USING ((user_id = ( SELECT auth.uid() AS uid)));


--
-- Name: notifications notifications_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY notifications_update ON public.notifications FOR UPDATE USING ((user_id = ( SELECT auth.uid() AS uid))) WITH CHECK ((user_id = ( SELECT auth.uid() AS uid)));


--
-- Name: roadmap_items; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.roadmap_items ENABLE ROW LEVEL SECURITY;

--
-- Name: roadmap_votes; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.roadmap_votes ENABLE ROW LEVEL SECURITY;

--
-- Name: saved_shared_notes; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.saved_shared_notes ENABLE ROW LEVEL SECURITY;

--
-- Name: shared_note_tags; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.shared_note_tags ENABLE ROW LEVEL SECURITY;

--
-- Name: shared_notes; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.shared_notes ENABLE ROW LEVEL SECURITY;

--
-- Name: shared_notes_analytics; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.shared_notes_analytics ENABLE ROW LEVEL SECURITY;

--
-- Name: shared_notes_readers; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.shared_notes_readers ENABLE ROW LEVEL SECURITY;

--
-- Name: subscriptions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;

--
-- Name: tags; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.tags ENABLE ROW LEVEL SECURITY;

--
-- Name: user_settings; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.user_settings ENABLE ROW LEVEL SECURITY;

--
-- Name: user_settings user_settings_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY user_settings_insert ON public.user_settings FOR INSERT WITH CHECK ((user_id = ( SELECT auth.uid() AS uid)));


--
-- Name: user_settings user_settings_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY user_settings_select ON public.user_settings FOR SELECT USING ((user_id = ( SELECT auth.uid() AS uid)));


--
-- Name: user_settings user_settings_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY user_settings_update ON public.user_settings FOR UPDATE USING ((user_id = ( SELECT auth.uid() AS uid))) WITH CHECK ((user_id = ( SELECT auth.uid() AS uid)));


--
-- Name: writing_sessions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.writing_sessions ENABLE ROW LEVEL SECURITY;

--
-- Name: SCHEMA public; Type: ACL; Schema: -; Owner: -
--

GRANT USAGE ON SCHEMA public TO postgres;
GRANT USAGE ON SCHEMA public TO anon;
GRANT USAGE ON SCHEMA public TO authenticated;
GRANT USAGE ON SCHEMA public TO service_role;


--
-- Name: FUNCTION author_id_by_email(p_email text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.author_id_by_email(p_email text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.author_id_by_email(p_email text) TO postgres;
GRANT ALL ON FUNCTION public.author_id_by_email(p_email text) TO authenticated;
GRANT ALL ON FUNCTION public.author_id_by_email(p_email text) TO service_role;


--
-- Name: FUNCTION can_access_note_live(p_note_id uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.can_access_note_live(p_note_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.can_access_note_live(p_note_id uuid) TO postgres;
GRANT ALL ON FUNCTION public.can_access_note_live(p_note_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.can_access_note_live(p_note_id uuid) TO service_role;


--
-- Name: FUNCTION create_author_with_random_username(user_id uuid); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.create_author_with_random_username(user_id uuid) TO postgres;
GRANT ALL ON FUNCTION public.create_author_with_random_username(user_id uuid) TO anon;
GRANT ALL ON FUNCTION public.create_author_with_random_username(user_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.create_author_with_random_username(user_id uuid) TO service_role;


--
-- Name: FUNCTION generate_random_username(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.generate_random_username() TO postgres;
GRANT ALL ON FUNCTION public.generate_random_username() TO anon;
GRANT ALL ON FUNCTION public.generate_random_username() TO authenticated;
GRANT ALL ON FUNCTION public.generate_random_username() TO service_role;


--
-- Name: FUNCTION handle_new_user(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.handle_new_user() TO postgres;
GRANT ALL ON FUNCTION public.handle_new_user() TO anon;
GRANT ALL ON FUNCTION public.handle_new_user() TO authenticated;
GRANT ALL ON FUNCTION public.handle_new_user() TO service_role;


--
-- Name: FUNCTION increment_view_count(shortcode_param text); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.increment_view_count(shortcode_param text) TO postgres;
GRANT ALL ON FUNCTION public.increment_view_count(shortcode_param text) TO anon;
GRANT ALL ON FUNCTION public.increment_view_count(shortcode_param text) TO authenticated;
GRANT ALL ON FUNCTION public.increment_view_count(shortcode_param text) TO service_role;


--
-- Name: FUNCTION is_note_chat_participant(p_note_id uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.is_note_chat_participant(p_note_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.is_note_chat_participant(p_note_id uuid) TO postgres;
GRANT ALL ON FUNCTION public.is_note_chat_participant(p_note_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.is_note_chat_participant(p_note_id uuid) TO service_role;


--
-- Name: FUNCTION note_chat_reply_same_note(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.note_chat_reply_same_note() TO postgres;
GRANT ALL ON FUNCTION public.note_chat_reply_same_note() TO anon;
GRANT ALL ON FUNCTION public.note_chat_reply_same_note() TO authenticated;
GRANT ALL ON FUNCTION public.note_chat_reply_same_note() TO service_role;


--
-- Name: FUNCTION realtime_note_id(p_prefix text); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.realtime_note_id(p_prefix text) TO postgres;
GRANT ALL ON FUNCTION public.realtime_note_id(p_prefix text) TO anon;
GRANT ALL ON FUNCTION public.realtime_note_id(p_prefix text) TO authenticated;
GRANT ALL ON FUNCTION public.realtime_note_id(p_prefix text) TO service_role;


--
-- Name: FUNCTION roadmap_sync_vote_count(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.roadmap_sync_vote_count() TO postgres;
GRANT ALL ON FUNCTION public.roadmap_sync_vote_count() TO anon;
GRANT ALL ON FUNCTION public.roadmap_sync_vote_count() TO authenticated;
GRANT ALL ON FUNCTION public.roadmap_sync_vote_count() TO service_role;


--
-- Name: TABLE account_deletions; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.account_deletions TO postgres;
GRANT ALL ON TABLE public.account_deletions TO anon;
GRANT ALL ON TABLE public.account_deletions TO authenticated;
GRANT ALL ON TABLE public.account_deletions TO service_role;


--
-- Name: TABLE account_exports; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.account_exports TO postgres;
GRANT ALL ON TABLE public.account_exports TO anon;
GRANT ALL ON TABLE public.account_exports TO authenticated;
GRANT ALL ON TABLE public.account_exports TO service_role;


--
-- Name: TABLE authors; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.authors TO postgres;
GRANT ALL ON TABLE public.authors TO anon;
GRANT ALL ON TABLE public.authors TO authenticated;
GRANT ALL ON TABLE public.authors TO service_role;


--
-- Name: TABLE collections; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.collections TO postgres;
GRANT ALL ON TABLE public.collections TO anon;
GRANT ALL ON TABLE public.collections TO authenticated;
GRANT ALL ON TABLE public.collections TO service_role;


--
-- Name: TABLE collections_notes; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.collections_notes TO postgres;
GRANT ALL ON TABLE public.collections_notes TO anon;
GRANT ALL ON TABLE public.collections_notes TO authenticated;
GRANT ALL ON TABLE public.collections_notes TO service_role;


--
-- Name: SEQUENCE collections_notes_id_seq; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON SEQUENCE public.collections_notes_id_seq TO postgres;
GRANT ALL ON SEQUENCE public.collections_notes_id_seq TO anon;
GRANT ALL ON SEQUENCE public.collections_notes_id_seq TO authenticated;
GRANT ALL ON SEQUENCE public.collections_notes_id_seq TO service_role;


--
-- Name: TABLE note_chat_message_versions; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.note_chat_message_versions TO postgres;
GRANT ALL ON TABLE public.note_chat_message_versions TO anon;
GRANT ALL ON TABLE public.note_chat_message_versions TO authenticated;
GRANT ALL ON TABLE public.note_chat_message_versions TO service_role;


--
-- Name: TABLE note_chat_messages; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.note_chat_messages TO postgres;
GRANT ALL ON TABLE public.note_chat_messages TO anon;
GRANT ALL ON TABLE public.note_chat_messages TO authenticated;
GRANT ALL ON TABLE public.note_chat_messages TO service_role;


--
-- Name: TABLE note_chat_reads; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.note_chat_reads TO postgres;
GRANT ALL ON TABLE public.note_chat_reads TO anon;
GRANT ALL ON TABLE public.note_chat_reads TO authenticated;
GRANT ALL ON TABLE public.note_chat_reads TO service_role;


--
-- Name: TABLE note_tags; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.note_tags TO postgres;
GRANT ALL ON TABLE public.note_tags TO anon;
GRANT ALL ON TABLE public.note_tags TO authenticated;
GRANT ALL ON TABLE public.note_tags TO service_role;


--
-- Name: TABLE note_versions; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.note_versions TO postgres;
GRANT ALL ON TABLE public.note_versions TO anon;
GRANT ALL ON TABLE public.note_versions TO authenticated;
GRANT ALL ON TABLE public.note_versions TO service_role;


--
-- Name: TABLE note_ydoc; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.note_ydoc TO postgres;
GRANT ALL ON TABLE public.note_ydoc TO anon;
GRANT ALL ON TABLE public.note_ydoc TO authenticated;
GRANT ALL ON TABLE public.note_ydoc TO service_role;


--
-- Name: TABLE notebooks; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.notebooks TO postgres;
GRANT ALL ON TABLE public.notebooks TO anon;
GRANT ALL ON TABLE public.notebooks TO authenticated;
GRANT ALL ON TABLE public.notebooks TO service_role;


--
-- Name: TABLE notes; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.notes TO postgres;
GRANT ALL ON TABLE public.notes TO anon;
GRANT ALL ON TABLE public.notes TO authenticated;
GRANT ALL ON TABLE public.notes TO service_role;


--
-- Name: TABLE notifications; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.notifications TO postgres;
GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE ON TABLE public.notifications TO anon;
GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE ON TABLE public.notifications TO authenticated;
GRANT ALL ON TABLE public.notifications TO service_role;


--
-- Name: COLUMN notifications.read_at; Type: ACL; Schema: public; Owner: -
--

GRANT UPDATE(read_at) ON TABLE public.notifications TO authenticated;


--
-- Name: TABLE roadmap_items; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.roadmap_items TO postgres;
GRANT ALL ON TABLE public.roadmap_items TO anon;
GRANT ALL ON TABLE public.roadmap_items TO authenticated;
GRANT ALL ON TABLE public.roadmap_items TO service_role;


--
-- Name: TABLE roadmap_votes; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.roadmap_votes TO postgres;
GRANT ALL ON TABLE public.roadmap_votes TO anon;
GRANT ALL ON TABLE public.roadmap_votes TO authenticated;
GRANT ALL ON TABLE public.roadmap_votes TO service_role;


--
-- Name: TABLE saved_shared_notes; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.saved_shared_notes TO postgres;
GRANT ALL ON TABLE public.saved_shared_notes TO anon;
GRANT ALL ON TABLE public.saved_shared_notes TO authenticated;
GRANT ALL ON TABLE public.saved_shared_notes TO service_role;


--
-- Name: TABLE shared_note_tags; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.shared_note_tags TO postgres;
GRANT ALL ON TABLE public.shared_note_tags TO anon;
GRANT ALL ON TABLE public.shared_note_tags TO authenticated;
GRANT ALL ON TABLE public.shared_note_tags TO service_role;


--
-- Name: TABLE shared_notes; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.shared_notes TO postgres;
GRANT ALL ON TABLE public.shared_notes TO anon;
GRANT ALL ON TABLE public.shared_notes TO authenticated;
GRANT ALL ON TABLE public.shared_notes TO service_role;


--
-- Name: TABLE shared_notes_analytics; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.shared_notes_analytics TO postgres;
GRANT ALL ON TABLE public.shared_notes_analytics TO anon;
GRANT ALL ON TABLE public.shared_notes_analytics TO authenticated;
GRANT ALL ON TABLE public.shared_notes_analytics TO service_role;


--
-- Name: TABLE shared_notes_readers; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.shared_notes_readers TO postgres;
GRANT ALL ON TABLE public.shared_notes_readers TO anon;
GRANT ALL ON TABLE public.shared_notes_readers TO authenticated;
GRANT ALL ON TABLE public.shared_notes_readers TO service_role;


--
-- Name: TABLE subscriptions; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.subscriptions TO postgres;
GRANT ALL ON TABLE public.subscriptions TO anon;
GRANT ALL ON TABLE public.subscriptions TO authenticated;
GRANT ALL ON TABLE public.subscriptions TO service_role;


--
-- Name: TABLE tags; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.tags TO postgres;
GRANT ALL ON TABLE public.tags TO anon;
GRANT ALL ON TABLE public.tags TO authenticated;
GRANT ALL ON TABLE public.tags TO service_role;


--
-- Name: TABLE user_settings; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.user_settings TO postgres;
GRANT ALL ON TABLE public.user_settings TO anon;
GRANT ALL ON TABLE public.user_settings TO authenticated;
GRANT ALL ON TABLE public.user_settings TO service_role;


--
-- Name: TABLE writing_sessions; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.writing_sessions TO postgres;
GRANT ALL ON TABLE public.writing_sessions TO anon;
GRANT ALL ON TABLE public.writing_sessions TO authenticated;
GRANT ALL ON TABLE public.writing_sessions TO service_role;


--
-- Name: DEFAULT PRIVILEGES FOR SEQUENCES; Type: DEFAULT ACL; Schema: public; Owner: -
--

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON SEQUENCES  TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON SEQUENCES  TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON SEQUENCES  TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON SEQUENCES  TO service_role;


--
-- Name: DEFAULT PRIVILEGES FOR SEQUENCES; Type: DEFAULT ACL; Schema: public; Owner: -
--



--
-- Name: DEFAULT PRIVILEGES FOR FUNCTIONS; Type: DEFAULT ACL; Schema: public; Owner: -
--

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON FUNCTIONS  TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON FUNCTIONS  TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON FUNCTIONS  TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON FUNCTIONS  TO service_role;


--
-- Name: DEFAULT PRIVILEGES FOR FUNCTIONS; Type: DEFAULT ACL; Schema: public; Owner: -
--



--
-- Name: DEFAULT PRIVILEGES FOR TABLES; Type: DEFAULT ACL; Schema: public; Owner: -
--

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON TABLES  TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON TABLES  TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON TABLES  TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON TABLES  TO service_role;


--
-- Name: DEFAULT PRIVILEGES FOR TABLES; Type: DEFAULT ACL; Schema: public; Owner: -
--



--
-- PostgreSQL database dump complete
--

--
-- auth.users signup trigger (from production: on_auth_user_created).
-- Creates the public.authors row for every new auth user.
--

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Undo the dump's session settings (search_path = '', row_security = off, ...)
-- so the migrations that follow see the default search_path.
RESET search_path;
RESET row_security;
RESET check_function_bodies;
RESET client_min_messages;
RESET statement_timeout;
RESET lock_timeout;
RESET idle_in_transaction_session_timeout;
RESET xmloption;
