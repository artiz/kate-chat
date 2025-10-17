// @generated automatically by Diesel CLI.

diesel::table! {
    chats (id) {
        id -> Text,
        title -> Text,
        description -> Text,
        user_id -> Nullable<Text>,
        files -> Nullable<Text>,
        model_id -> Nullable<Text>,
        system_prompt -> Nullable<Text>,
        temperature -> Nullable<Float>,
        max_tokens -> Nullable<Integer>,
        top_p -> Nullable<Float>,
        is_pristine -> Bool,
        created_at -> Timestamp,
        updated_at -> Timestamp,
    }
}

diesel::table! {
    linked_messages (rowid) {
        rowid -> Integer,
        message_id -> Text,
        linked_to_message_id -> Text,
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
        json_content -> Nullable<Text>,
        metadata -> Nullable<Text>,
        created_at -> Timestamp,
        updated_at -> Timestamp,
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
        default_temperature -> Nullable<Float>,
        default_max_tokens -> Nullable<Integer>,
        default_top_p -> Nullable<Float>,
        default_images_count -> Nullable<Integer>,
        avatar_url -> Nullable<Text>,
        google_id -> Nullable<Text>,
        github_id -> Nullable<Text>,
        auth_provider -> Nullable<Text>,
        role -> Text,
        settings -> Nullable<Text>,
        created_at -> Timestamp,
        updated_at -> Timestamp,
    }
}

diesel::joinable!(chats -> users (user_id));
diesel::joinable!(messages -> chats (chat_id));
diesel::joinable!(messages -> users (user_id));
diesel::joinable!(models -> users (user_id));

diesel::allow_tables_to_appear_in_same_query!(chats, linked_messages, messages, models, users,);
