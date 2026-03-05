import { supabaseAdmin } from './src/lib/supabase-admin'

async function verifyUsers() {
    const emails = ['circle@ekr.or.kr', 'hwan1612@ekr.or.kr'];
    console.log('Fetching users...');

    const { data: usersData, error: usersError } = await supabaseAdmin.auth.admin.listUsers()
    if (usersError) {
        console.error('Error fetching users:', usersError)
        return
    }

    for (const email of emails) {
        const user = usersData.users.find(u => u.email === email)
        if (!user) {
            console.log(`User ${email} not found`)
            continue
        }

        const { data, error } = await supabaseAdmin.auth.admin.updateUserById(
            user.id,
            { email_confirm: true }
        )
        if (error) {
            console.error(`Error verifying ${email}:`, error)
        } else {
            console.log(`Successfully verified ${email}`)
        }
    }
}

verifyUsers()
