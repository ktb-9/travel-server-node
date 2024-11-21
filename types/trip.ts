export interface TripDetails {
  trip_id: number;
  group_id: number;
  date: string;
  created_date?: string;
  updated_date?: string;
}

export interface TripLocationDetails {
  location_id: number;
  trip_id: number;
  day: number;
  name: string;
  address: string;
  visit_time: string;
  category: string;
  hashtag: string;
  thumbnail: string;
  created_date?: string;
}

export interface TripWithMembers extends TripDetails {
  group_name: string;
  locations: TripLocationDetails[];
  members: Array<{
    user_id: number;
    nickname: string;
    profileImage?: string;
    role: string;
  }>;
}
