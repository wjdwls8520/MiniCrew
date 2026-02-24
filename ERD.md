# MiniCrew Database Schema (ERD)

```mermaid
erDiagram
    %% Entities
    COMPANY {
        uuid id PK "Primary Key"
        string name "Company Name"
        datetime created_at
    }

    USER {
        uuid id PK "Supabase Auth ID"
        uuid company_id FK
        string email
        string name "Display Name"
        string role "Member/Admin"
        string avatar_url
        datetime created_at
    }

    PROJECT {
        uuid id PK
        uuid company_id FK
        string name "Project Name"
        string description
        uuid created_by FK "User ID"
        datetime created_at
    }

    PROJECT_MEMBER {
        uuid project_id FK
        uuid user_id FK
        string role "Leader/Member"
        boolean is_favorite "For Sidebar Shortcut"
        datetime joined_at
    }

    CATEGORY {
        uuid id PK
        uuid project_id FK
        string name "Tab Name (Planning, Design, etc.)"
        int order "Sort Order"
        datetime created_at
    }

    POST {
        uuid id PK
        uuid category_id FK
        uuid author_id FK "User ID"
        string title
        text content
        string status "Scheduled/Progress/Done/Hold/Issue"
        datetime created_at
        datetime updated_at
    }

    COMMENT {
        uuid id PK
        uuid post_id FK
        uuid author_id FK "User ID"
        text content
        datetime created_at
    }

    NOTIFICATION {
        uuid id PK
        uuid recipient_id FK "User ID"
        uuid actor_id FK "User ID (Triggered by)"
        string type "StatusChange/Comment/NewPost"
        uuid reference_id "Post or Project ID"
        boolean is_read
        datetime created_at
    }

    %% Relationships
    COMPANY ||--o{ USER : has
    COMPANY ||--o{ PROJECT : contains
    
    USER ||--o{ PROJECT_MEMBER : participates
    PROJECT ||--o{ PROJECT_MEMBER : has_members
    
    USER ||--o{ POST : writes
    USER ||--o{ COMMENT : writes
    
    PROJECT ||--o{ CATEGORY : contains_tabs
    CATEGORY ||--o{ POST : contains_cards
    
    POST ||--o{ COMMENT : has_comments
    
    USER ||--o{ NOTIFICATION : receives
```

## Schema Description

### 1. Users & Auth (Supabase Auth)
- **Profile Table**: Maps to Supabase `auth.users` via `id`.
- **Company Context**: Currently assumes single-tenant per deployment or filtered by `company_id` for multi-tenant (SaaS). We will use `company_id` to scope data access by RLS policies.

### 2. Project Hierarchy
- **Project Structure**: Groups -> Projects -> Categories (Tabs) -> Posts.
- **Categories**: This is the "Tab" feature requested (e.g., Planning, Design, Dev).

### 3. Post (Task/Card)
- **Status Field**: Enum-like string (`Scheduled`, `Progress`, `Done`, `Hold`, `Issue`).
- **Minimal Metadata**: Focus on core info (Title, Author, Status, Content) as per "Card Layout" request.

### 4. Interactions
- **Favorites**: Handled in `PROJECT_MEMBER` table with `is_favorite` flag.
- **Notifications**: Dedicated table for sync/async notifications on status changes or comments.

## Supabase Implementation Notes
- Use **RLS (Row Level Security)** policies to restrict access based on `company_id` and `project_member` status.
- Use **Triggers** to auto-create notifications on `UPDATE` of `post.status` or `INSERT` of `comment`.
