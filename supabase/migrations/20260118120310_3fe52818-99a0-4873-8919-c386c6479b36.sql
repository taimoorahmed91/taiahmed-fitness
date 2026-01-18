-- Update handle_new_user function to insert into profiles table instead of/in addition to expense_profile
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  -- Insert into profiles table (for fitness app auth/approval)
  INSERT INTO public.profiles (id, email, full_name, avatar_url, approved)
  VALUES (
    NEW.id,
    NEW.email,
    NEW.raw_user_meta_data->>'full_name',
    NEW.raw_user_meta_data->>'avatar_url',
    NULL  -- Start with null so they appear in pending approval
  )
  ON CONFLICT (id) DO NOTHING;  -- Don't fail if profile already exists
  
  -- Keep existing expense_profile insert for backward compatibility
  INSERT INTO public.expense_profile (user_id, email, full_name, avatar_url)
  VALUES (
    NEW.id,
    NEW.email,
    NEW.raw_user_meta_data->>'full_name',
    NEW.raw_user_meta_data->>'avatar_url'
  )
  ON CONFLICT (user_id) DO NOTHING;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;