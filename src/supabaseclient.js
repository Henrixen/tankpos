import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://otvnapimxxuyvhhxkdmy.supabase.co'
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im90dm5hcGlteHh1eXZoaHhrZG15Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI2MzQ0NDgsImV4cCI6MjA4ODIxMDQ0OH0.eP2mAbU4jqhYjowjOS3WheDAwyfaSqCjy30oz5Afp74'

export const supabase = createClient(supabaseUrl, supabaseKey)
