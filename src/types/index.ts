export type UserRole = 'admin' | 'member';
export type ProjectRole = 'leader' | 'member';
export type PostStatus = 'Scheduled' | 'Progress' | 'Done' | 'Hold' | 'Issue';

export interface User {
  id: string; // UUID
  email: string;
  name: string;
  avatar_url?: string;
  company_id?: string;
  created_at: string;
}

export interface Company {
  id: string;
  name: string;
  created_at: string;
}

export interface Project {
  id: string;
  company_id: string;
  name: string;
  description?: string;
  created_by: string; // User ID
  created_at: string;
}

export interface ProjectMember {
  project_id: string;
  user_id: string;
  role: ProjectRole;
  is_favorite: boolean;
  joined_at: string;
}

export interface Category {
  id: string;
  project_id: string;
  name: string;
  order: number;
  created_at: string;
}

export interface Post {
  id: string;
  category_id: string;
  author_id: string;
  title: string;
  content: string;
  status: PostStatus;
  created_at: string;
  updated_at: string;
  
  // Joins (optional in type, mandatory in UI maybe)
  author?: User;
  comment_count?: number;
}

export interface Comment {
  id: string;
  post_id: string;
  author_id: string;
  content: string;
  created_at: string;
  
  // Joins
  author?: User;
}

export interface Notification {
  id: string;
  recipient_id: string;
  actor_id: string;
  type: 'StatusChange' | 'Comment' | 'NewPost';
  reference_id: string;
  is_read: boolean;
  created_at: string;
}
