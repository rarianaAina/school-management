import { supabase } from '@/lib/supabase'

export interface AdminSnapshot {
  students: number
  teachers: number
  classes: number
  fillRate: number | null
  invoiced: number
  collected: number
  outstanding: number
  overdueStudents: number
  attendanceRate: number | null
  passRate: number | null
}

export async function getAdminSnapshot(
  schoolId: string,
  academicYearId: string,
  passingScore: number,
): Promise<AdminSnapshot> {
  const [students, teachers, classes, balances, attendance, results] = await Promise.all([
    supabase
      .from('enrollments')
      .select('id', { count: 'exact', head: true })
      .eq('school_id', schoolId)
      .eq('academic_year_id', academicYearId)
      .eq('status', 'active'),
    supabase
      .from('teachers')
      .select('id', { count: 'exact', head: true })
      .eq('school_id', schoolId)
      .is('deleted_at', null),
    supabase
      .from('class_overview')
      .select('enrolled_count, capacity')
      .eq('school_id', schoolId)
      .eq('academic_year_id', academicYearId),
    supabase
      .from('student_balances')
      .select('total_invoiced, total_paid, balance')
      .eq('school_id', schoolId)
      .eq('academic_year_id', academicYearId),
    supabase.from('attendance_stats').select('attendance_rate').eq('school_id', schoolId),
    supabase.from('term_results').select('general_average').eq('school_id', schoolId),
  ])

  const classRows = classes.data ?? []
  const enrolled = classRows.reduce((sum, row) => sum + Number(row.enrolled_count ?? 0), 0)
  const capacity = classRows.reduce((sum, row) => sum + Number(row.capacity ?? 0), 0)

  const balanceRows = balances.data ?? []
  const attendanceRows = (attendance.data ?? []).filter((row) => row.attendance_rate !== null)
  const resultRows = (results.data ?? []).filter((row) => row.general_average !== null)

  return {
    students: students.count ?? 0,
    teachers: teachers.count ?? 0,
    classes: classRows.length,
    fillRate: capacity > 0 ? (enrolled / capacity) * 100 : null,
    invoiced: balanceRows.reduce((sum, row) => sum + Number(row.total_invoiced ?? 0), 0),
    collected: balanceRows.reduce((sum, row) => sum + Number(row.total_paid ?? 0), 0),
    outstanding: balanceRows.reduce((sum, row) => sum + Number(row.balance ?? 0), 0),
    overdueStudents: balanceRows.filter((row) => Number(row.balance ?? 0) > 0).length,
    attendanceRate:
      attendanceRows.length > 0
        ? attendanceRows.reduce((sum, row) => sum + Number(row.attendance_rate), 0) /
          attendanceRows.length
        : null,
    passRate:
      resultRows.length > 0
        ? (resultRows.filter((row) => Number(row.general_average) >= passingScore).length /
            resultRows.length) *
          100
        : null,
  }
}

/** Effectifs par niveau — magnitude comparée, donc barres. */
export async function getEnrollmentByLevel(schoolId: string, academicYearId: string) {
  const { data, error } = await supabase
    .from('class_overview')
    .select('level_name, level_order, enrolled_count, capacity')
    .eq('school_id', schoolId)
    .eq('academic_year_id', academicYearId)
  if (error) throw error

  const byLevel = new Map<string, { level: string; order: number; students: number; capacity: number }>()
  for (const row of data ?? []) {
    const key = row.level_name ?? '—'
    const current = byLevel.get(key) ?? {
      level: key,
      order: Number(row.level_order ?? 0),
      students: 0,
      capacity: 0,
    }
    current.students += Number(row.enrolled_count ?? 0)
    current.capacity += Number(row.capacity ?? 0)
    byLevel.set(key, current)
  }

  return [...byLevel.values()].sort((a, b) => a.order - b.order)
}

/** Recettes mensuelles — évolution dans le temps, donc courbe. */
export async function getRevenueSeries(schoolId: string) {
  const { data, error } = await supabase
    .from('monthly_revenue')
    .select('*')
    .eq('school_id', schoolId)
    .order('month')
  if (error) throw error

  return (data ?? []).map((row) => ({
    month: row.month!,
    amount: Number(row.amount ?? 0),
    count: Number(row.payment_count ?? 0),
  }))
}

/** Distribution des moyennes par tranche — forme de la réussite, pas seulement sa moyenne. */
export async function getGradeDistribution(schoolId: string, scale: number) {
  const { data, error } = await supabase
    .from('term_results')
    .select('general_average')
    .eq('school_id', schoolId)
    .not('general_average', 'is', null)
  if (error) throw error

  const step = scale / 5
  const buckets = Array.from({ length: 5 }, (_, index) => ({
    range: `${Math.round(index * step)}–${Math.round((index + 1) * step)}`,
    students: 0,
  }))

  for (const row of data ?? []) {
    const value = Number(row.general_average)
    const index = Math.min(4, Math.floor(value / step))
    buckets[index]!.students += 1
  }

  return buckets
}

/** Assiduité par classe. */
export async function getAttendanceByClass(schoolId: string) {
  const { data, error } = await supabase
    .from('attendance_stats')
    .select('class_id, attendance_rate, absent_count')
    .eq('school_id', schoolId)
  if (error) throw error

  const { data: classes } = await supabase
    .from('classes')
    .select('id, name')
    .eq('school_id', schoolId)

  const names = new Map((classes ?? []).map((row) => [row.id, row.name]))
  const byClass = new Map<string, { name: string; rates: number[]; absences: number }>()

  for (const row of data ?? []) {
    if (!row.class_id) continue
    const current = byClass.get(row.class_id) ?? {
      name: names.get(row.class_id) ?? '—',
      rates: [],
      absences: 0,
    }
    if (row.attendance_rate !== null) current.rates.push(Number(row.attendance_rate))
    current.absences += Number(row.absent_count ?? 0)
    byClass.set(row.class_id, current)
  }

  return [...byClass.values()].map((row) => ({
    name: row.name,
    rate: row.rates.length > 0 ? row.rates.reduce((a, b) => a + b, 0) / row.rates.length : 0,
    absences: row.absences,
  }))
}

// -----------------------------------------------------------------------------
// Espaces enseignant et famille
// -----------------------------------------------------------------------------
export async function getTeacherToday(schoolId: string, userId: string, date: string) {
  const { data: teacher } = await supabase
    .from('teachers')
    .select('id')
    .eq('school_id', schoolId)
    .eq('profile_id', userId)
    .maybeSingle()

  if (!teacher) return { lessons: [], pendingAssessments: 0, teacherId: null }

  const [lessons, assessments] = await Promise.all([
    supabase
      .from('lesson_attendance')
      .select('*')
      .eq('school_id', schoolId)
      .eq('date', date)
      .order('start_time'),
    supabase
      .from('assessments')
      .select('id, class_subject_id, title, grades(count)')
      .eq('school_id', schoolId)
      .eq('is_published', false),
  ])

  return {
    lessons: (lessons.data ?? []).filter((row) => row.teacher_name),
    pendingAssessments: (assessments.data ?? []).length,
    teacherId: teacher.id,
  }
}

export async function getFamilySnapshot(academicYearId: string) {
  const { data: students } = await supabase
    .from('student_overview')
    .select('id, full_name, class_id, class_name, matricule')
    .eq('academic_year_id', academicYearId)

  const first = students?.[0]
  if (!first) return null

  const [results, attendance, balance, upcoming] = await Promise.all([
    supabase
      .from('term_results')
      .select('general_average, rank, class_size, is_published, term_id')
      .eq('student_id', first.id!)
      .eq('is_published', true)
      .order('computed_at', { ascending: false })
      .limit(1),
    supabase.from('attendance_stats').select('*').eq('student_id', first.id!).maybeSingle(),
    supabase
      .from('student_balances')
      .select('balance, total_invoiced, total_paid')
      .eq('student_id', first.id!)
      .maybeSingle(),
    supabase
      .from('lesson_attendance')
      .select('*')
      .eq('class_id', first.class_id!)
      .gte('date', new Date().toISOString().slice(0, 10))
      .order('date')
      .order('start_time')
      .limit(5),
  ])

  return {
    student: first,
    result: results.data?.[0] ?? null,
    attendance: attendance.data,
    balance: balance.data,
    upcoming: upcoming.data ?? [],
  }
}
