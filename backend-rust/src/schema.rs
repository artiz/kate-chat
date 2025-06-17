// @generated automatically by Diesel CLI.

diesel::table! {
    chats (id) {
        id -> Text,
        title -> Text,
        description -> Text,
        user_id -> Nullable<Text>,
        files -> Nullable<Text>,
        last_bot_message -> Nullable<Text>,
        last_bot_message_id -> Nullable<Text>,
        messages_count -> Nullable<Integer>,
        model_id -> Nullable<Text>,
        temperature -> Nullable<Float>,
        max_tokens -> Nullable<Integer>,
        top_p -> Nullable<Float>,
        is_pristine -> Bool,
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
        model_id -> Text,
        model_name -> Nullable<Text>,
        created_at -> Timestamp,
        updated_at -> Timestamp,
        user_name -> Nullable<Text>,
    }
}

diesel::table! {
    models (id) {
        id -> Text,
        name -> Text,
        description -> Text,
        model_id -> Text,
        api_provider -> Text,
        provider -> Nullable<Text>,
        is_active -> Bool,
        is_custom -> Bool,
        supports_text_in -> Bool,
        supports_text_out -> Bool,
        supports_image_in -> Bool,
        supports_image_out -> Bool,
        supports_embeddings_in -> Bool,
        supports_embeddings_out -> Bool,
        supports_streaming -> Bool,
        user_id -> Text,
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
        default_model_id -> Nullable<Text>,
        default_system_prompt -> Nullable<Text>,
        avatar_url -> Nullable<Text>,
        google_id -> Nullable<Text>,
        github_id -> Nullable<Text>,
        auth_provider -> Nullable<Text>,
        created_at -> Timestamp,
        updated_at -> Timestamp,
    }
}

diesel::joinable!(chats -> users (user_id));
diesel::joinable!(messages -> chats (chat_id));
diesel::joinable!(messages -> users (user_id));
diesel::joinable!(models -> users (user_id));

diesel::allow_tables_to_appear_in_same_query!(
    chats,
    messages,
    models,
    users,
);
