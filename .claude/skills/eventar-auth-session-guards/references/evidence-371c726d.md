An unconfirmed session with a staff-matching email would have looped between `/login` and `/dashboard`.
- The proxy now redirects to `/login?error=email_unconfirmed`, which shows the form with a neutral line and no staff lookup. The line is the same for every unconfirmed person, so it reveals nothing about staff membership.

Test result: "× ?error=email_unconfirmed shows the form with the notice and does not run the staff check or redirect 3009ms"