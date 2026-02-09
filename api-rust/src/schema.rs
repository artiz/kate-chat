// @generated automatically by Diesel CLI.

diesel::table! {
    chat_documents (id) {
        id -> Text,
        chat_id -> Text,
        document_id -> Text,
    }
}

diesel::table! {
    chat_files (id) {
        id -> Text,
        chat_id -> Text,
        message_id -> Nullable<Text>,
        #[sql_name = "type"]
        type_ -> Text,
        file_name -> Nullable<Text>,
        mime -> Nullable<Text>,
        upload_file -> Nullable<Text>,
        predominant_color -> Nullable<Text>,
        exif -> Nullable<Text>,
        created_at -> Timestamp,
        updated_at -> Timestamp,
    }
}

diesel::table! {
    chats (id) {
        id -> Text,
        title -> Text,
        description -> Nullable<Text>,
        user_id -> Nullable<Text>,
        last_bot_message -> Nullable<Text>,
        last_bot_message_id -> Nullable<Text>,
        messages_count -> Nullable<Integer>,
        model_id -> Nullable<Text>,
        system_prompt -> Nullable<Text>,
        tools -> Nullable<Text>,
        temperature -> Nullable<Float>,
        max_tokens -> Nullable<Integer>,
        top_p -> Nullable<Float>,
        images_count -> Nullable<Integer>,
        is_pristine -> Bool,
        is_pinned -> Bool,
        created_at -> Timestamp,
        updated_at -> Timestamp,
    }
}

diesel::table! {
    document_chunks (id) {
        id -> Text,
        document_id -> Text,
        model_id -> Text,
        page -> Integer,
        page_index -> BigInt,
        content -> Text,
        embedding -> Nullable<Text>,
    }
}

diesel::table! {
    documents (id) {
        id -> Text,
        file_name -> Text,
        mime -> Nullable<Text>,
        file_size -> BigInt,
        sha256checksum -> Text,
        s3key -> Nullable<Text>,
        owner_id -> Text,
        embeddings_model_id -> Nullable<Text>,
        summary_model_id -> Nullable<Text>,
        summary -> Nullable<Text>,
        pages_count -> Integer,
        status -> Text,
        status_info -> Nullable<Text>,
        status_progress -> Float,
        created_at -> Timestamp,
        updated_at -> Timestamp,
    }
}

diesel::table! {
    mcp_servers (id) {
        id -> Text,
        name -> Text,
        url -> Text,
        description -> Nullable<Text>,
        transport_type -> Text,
        auth_type -> Text,
        auth_config -> Nullable<Text>,
        tools -> Nullable<Text>,
        is_active -> Bool,
        user_id -> Nullable<Text>,
        created_at -> Timestamp,
        updated_at -> Timestamp,
    }
}

diesel::table! {
    messages (id) {
        id -> Text,
        chat_id -> Text,
        user_id -> Nullable<Text>,
        content -> Text,
        role -> Text,
        model_id -> Nullable<Text>,
        model_name -> Nullable<Text>,
        json_content -> Nullable<Text>,
        metadata -> Nullable<Text>,
        linked_to_message_id -> Nullable<Text>,
        status -> Nullable<Text>,
        status_info -> Nullable<Text>,
        created_at -> Timestamp,
        updated_at -> Timestamp,
    }
}

diesel::table! {
    models (id) {
        id -> Text,
        name -> Text,
        model_id -> Text,
        description -> Nullable<Text>,
        user_id -> Nullable<Text>,
        provider -> Nullable<Text>,
        api_provider -> Text,
        #[sql_name = "type"]
        type_ -> Text,
        streaming -> Bool,
        image_input -> Bool,
        max_input_tokens -> Nullable<Integer>,
        tools -> Nullable<Text>,
        features -> Nullable<Text>,
        custom_settings -> Nullable<Text>,
        is_active -> Bool,
        is_custom -> Bool,
        created_at -> Timestamp,
        updated_at -> Timestamp,
    }
}

diesel::table! {
    users (id) {
        id -> Text,
        email -> Text,
        password -> Nullable<Text>,
        first_name -> Text,
        last_name -> Text,
        role -> Text,
        default_model_id -> Nullable<Text>,
        default_system_prompt -> Nullable<Text>,
        avatar_url -> Nullable<Text>,
        google_id -> Nullable<Text>,
        github_id -> Nullable<Text>,
        microsoft_id -> Nullable<Text>,
        auth_provider -> Nullable<Text>,
        settings -> Nullable<Text>,
        models_count -> Nullable<Integer>,
        documents_embeddings_model_id -> Nullable<Text>,
        document_summarization_model_id -> Nullable<Text>,
        chats_count -> Nullable<Integer>,
        default_temperature -> Nullable<Float>,
        default_max_tokens -> Nullable<Integer>,
        default_top_p -> Nullable<Float>,
        default_images_count -> Nullable<Integer>,
        created_at -> Timestamp,
        updated_at -> Timestamp,
    }
}

diesel::joinable!(chat_documents -> chats (chat_id));
diesel::joinable!(chat_documents -> documents (document_id));
diesel::joinable!(chat_files -> chats (chat_id));
diesel::joinable!(chat_files -> messages (message_id));
diesel::joinable!(chats -> users (user_id));
diesel::joinable!(document_chunks -> documents (document_id));
diesel::joinable!(documents -> users (owner_id));
diesel::joinable!(mcp_servers -> users (user_id));
diesel::joinable!(messages -> chats (chat_id));
diesel::joinable!(messages -> users (user_id));
diesel::joinable!(models -> users (user_id));

diesel::allow_tables_to_appear_in_same_query!(
    chat_documents,
    chat_files,
    chats,
    document_chunks,
    documents,
    mcp_servers,
    messages,
    models,
    users,
);
