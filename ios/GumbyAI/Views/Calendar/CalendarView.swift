import SwiftUI

struct CalendarView: View {
    @EnvironmentObject var calendarVM: CalendarViewModel
    @EnvironmentObject var sidebarVM: SidebarViewModel
    
    var body: some View {
        ZStack {
            AppConstants.backgroundColor.ignoresSafeArea()
            
            VStack(spacing: 0) {
                header
                monthSelector
                calendarGrid
                
                Divider()
                    .background(AppConstants.textSecondary.opacity(0.3))
                
                postsList
            }
            
            VStack {
                Spacer()
                HStack {
                    Spacer()
                    Button(action: { calendarVM.showNewPostSheet = true }) {
                        Image(systemName: "plus")
                            .font(.title2)
                            .fontWeight(.semibold)
                            .foregroundColor(.white)
                            .frame(width: 56, height: 56)
                            .background(AppConstants.accentGradient)
                            .clipShape(Circle())
                            .shadow(color: .black.opacity(0.3), radius: 8, y: 4)
                    }
                    .padding(20)
                }
            }
        }
        .sheet(isPresented: $calendarVM.showNewPostSheet) {
            NewPostSheet()
                .environmentObject(calendarVM)
        }
        .task {
            await calendarVM.loadPosts()
        }
    }
    
    private var header: some View {
        HStack {
            Button(action: { sidebarVM.toggle() }) {
                Image(systemName: "line.3.horizontal")
                    .font(.title2)
                    .foregroundColor(AppConstants.textPrimary)
            }
            
            Spacer()
            
            Text("Calendar")
                .font(.headline)
                .foregroundColor(AppConstants.textPrimary)
            
            Spacer()
            
            Color.clear.frame(width: 28, height: 28)
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 12)
    }
    
    private var monthSelector: some View {
        HStack {
            Button(action: { calendarVM.previousMonth() }) {
                Image(systemName: "chevron.left")
                    .foregroundColor(AppConstants.textPrimary)
            }
            
            Spacer()
            
            Text(monthYearString)
                .font(.title3)
                .fontWeight(.semibold)
                .foregroundColor(AppConstants.textPrimary)
            
            Spacer()
            
            Button(action: { calendarVM.nextMonth() }) {
                Image(systemName: "chevron.right")
                    .foregroundColor(AppConstants.textPrimary)
            }
        }
        .padding(.horizontal, 20)
        .padding(.vertical, 8)
    }
    
    private var monthYearString: String {
        let formatter = DateFormatter()
        formatter.dateFormat = "MMMM yyyy"
        return formatter.string(from: calendarVM.currentMonth)
    }
    
    private var calendarGrid: some View {
        let calendar = Calendar.current
        let slots = generateDaySlots()
        let weekdays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]

        return VStack(spacing: 8) {
            HStack {
                ForEach(weekdays, id: \.self) { day in
                    Text(day)
                        .font(.caption)
                        .fontWeight(.medium)
                        .foregroundColor(AppConstants.textSecondary)
                        .frame(maxWidth: .infinity)
                }
            }

            LazyVGrid(columns: Array(repeating: GridItem(.flexible()), count: 7), spacing: 8) {
                ForEach(slots) { slot in
                    if let date = slot.date {
                        let isSelected = calendar.isDate(date, inSameDayAs: calendarVM.selectedDate)
                        let hasPost = dateHasPost(date)

                        Button(action: { calendarVM.selectedDate = date }) {
                            VStack(spacing: 2) {
                                Text("\(calendar.component(.day, from: date))")
                                    .font(.subheadline)
                                    .foregroundColor(isSelected ? .white : AppConstants.textPrimary)

                                Circle()
                                    .fill(hasPost ? Color.orange : Color.clear)
                                    .frame(width: 6, height: 6)
                            }
                            .frame(width: 36, height: 40)
                            .background(
                                isSelected ?
                                    AnyShapeStyle(AppConstants.accentGradient) :
                                    AnyShapeStyle(Color.clear)
                            )
                            .clipShape(RoundedRectangle(cornerRadius: 8))
                        }
                    } else {
                        Color.clear.frame(width: 36, height: 40)
                    }
                }
            }
        }
        .padding(.horizontal, 16)
        .padding(.bottom, 12)
    }

    private func generateDaySlots() -> [CalendarDaySlot] {
        let calendar = Calendar.current
        let monthStart = calendar.date(from: calendar.dateComponents([.year, .month], from: calendarVM.currentMonth))!
        let weekday = calendar.component(.weekday, from: monthStart)
        let daysInMonth = calendar.range(of: .day, in: .month, for: monthStart)!.count

        var slots: [CalendarDaySlot] = []

        for i in 0..<(weekday - 1) {
            slots.append(CalendarDaySlot(id: "empty-start-\(i)", date: nil))
        }

        for day in 1...daysInMonth {
            if let date = calendar.date(byAdding: .day, value: day - 1, to: monthStart) {
                slots.append(CalendarDaySlot(id: "day-\(day)", date: date))
            }
        }

        var trailIndex = 0
        while slots.count % 7 != 0 {
            slots.append(CalendarDaySlot(id: "empty-end-\(trailIndex)", date: nil))
            trailIndex += 1
        }

        return slots
    }
    
    private func dateHasPost(_ date: Date) -> Bool {
        let formatter = DateFormatter()
        formatter.dateFormat = "yyyy-MM-dd"
        return calendarVM.datesWithPosts.contains(formatter.string(from: date))
    }
    
    private var postsList: some View {
        ScrollView {
            if calendarVM.postsForSelectedDate.isEmpty {
                VStack(spacing: 12) {
                    Image(systemName: "calendar.badge.plus")
                        .font(.system(size: 36))
                        .foregroundColor(AppConstants.textSecondary)
                    Text("No posts scheduled")
                        .font(.subheadline)
                        .foregroundColor(AppConstants.textSecondary)
                }
                .frame(maxWidth: .infinity)
                .padding(.top, 40)
            } else {
                LazyVStack(spacing: 12) {
                    ForEach(calendarVM.postsForSelectedDate) { post in
                        PostCard(post: post)
                    }
                }
                .padding(16)
            }
        }
    }
}

struct PostCard: View {
    let post: Post
    
    var body: some View {
        HStack(spacing: 12) {
            Image(systemName: post.platform.iconName)
                .font(.title2)
                .foregroundStyle(AppConstants.accentGradient)
                .frame(width: 40, height: 40)
                .background(AppConstants.backgroundColor)
                .clipShape(RoundedRectangle(cornerRadius: 8))
            
            VStack(alignment: .leading, spacing: 4) {
                Text(post.content)
                    .font(.subheadline)
                    .foregroundColor(AppConstants.textPrimary)
                    .lineLimit(2)
                
                HStack {
                    Text(timeString)
                        .font(.caption)
                        .foregroundColor(AppConstants.textSecondary)
                    
                    Text(post.status.rawValue.capitalized)
                        .font(.caption2)
                        .fontWeight(.semibold)
                        .padding(.horizontal, 8)
                        .padding(.vertical, 2)
                        .background(statusColor.opacity(0.2))
                        .foregroundColor(statusColor)
                        .clipShape(Capsule())
                }
            }
            
            Spacer()
        }
        .padding(12)
        .background(AppConstants.surfaceColor)
        .clipShape(RoundedRectangle(cornerRadius: AppConstants.cardCornerRadius))
    }
    
    private var timeString: String {
        let formatter = DateFormatter()
        formatter.dateFormat = "h:mm a"
        return formatter.string(from: post.scheduledDate)
    }
    
    private var statusColor: Color {
        switch post.status {
        case .planned: return .orange
        case .posted: return .green
        }
    }
}

struct NewPostSheet: View {
    @EnvironmentObject var calendarVM: CalendarViewModel
    @Environment(\.dismiss) var dismiss
    
    var body: some View {
        NavigationStack {
            ZStack {
                AppConstants.backgroundColor.ignoresSafeArea()
                
                ScrollView {
                    VStack(spacing: 20) {
                        VStack(alignment: .leading, spacing: 8) {
                            Text("Content")
                                .font(.subheadline)
                                .fontWeight(.medium)
                                .foregroundColor(AppConstants.textSecondary)
                            
                            TextEditor(text: $calendarVM.newPostContent)
                                .frame(minHeight: 120)
                                .padding(12)
                                .background(AppConstants.surfaceColor)
                                .clipShape(RoundedRectangle(cornerRadius: AppConstants.buttonCornerRadius))
                                .foregroundColor(AppConstants.textPrimary)
                                .scrollContentBackground(.hidden)
                        }
                        
                        VStack(alignment: .leading, spacing: 8) {
                            Text("Schedule")
                                .font(.subheadline)
                                .fontWeight(.medium)
                                .foregroundColor(AppConstants.textSecondary)
                            
                            DatePicker("", selection: $calendarVM.newPostDate)
                                .datePickerStyle(.compact)
                                .labelsHidden()
                                .colorScheme(.dark)
                        }
                        
                        VStack(alignment: .leading, spacing: 8) {
                            Text("Platform")
                                .font(.subheadline)
                                .fontWeight(.medium)
                                .foregroundColor(AppConstants.textSecondary)
                            
                            ScrollView(.horizontal, showsIndicators: false) {
                                HStack(spacing: 10) {
                                    ForEach(Platform.allCases, id: \.self) { platform in
                                        PlatformChip(
                                            platform: platform,
                                            isSelected: calendarVM.newPostPlatform == platform
                                        ) {
                                            calendarVM.newPostPlatform = platform
                                        }
                                    }
                                }
                            }
                        }
                        
                        Button(action: {
                            Task {
                                await calendarVM.createPost()
                            }
                        }) {
                            Text("Schedule Post")
                                .font(.headline)
                                .frame(maxWidth: .infinity)
                                .padding(.vertical, 14)
                                .background(AppConstants.accentGradient)
                                .foregroundColor(.white)
                                .clipShape(RoundedRectangle(cornerRadius: AppConstants.buttonCornerRadius))
                        }
                        .disabled(calendarVM.newPostContent.isEmpty)
                    }
                    .padding(20)
                }
            }
            .navigationTitle("New Post")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                        .foregroundColor(AppConstants.textSecondary)
                }
            }
            .toolbarColorScheme(.dark, for: .navigationBar)
        }
    }
}

struct CalendarDaySlot: Identifiable {
    let id: String
    let date: Date?
}

struct PlatformChip: View {
    let platform: Platform
    let isSelected: Bool
    let action: () -> Void
    
    var body: some View {
        Button(action: action) {
            HStack(spacing: 6) {
                Image(systemName: platform.iconName)
                    .font(.caption)
                Text(platform.displayName)
                    .font(.caption)
                    .fontWeight(.medium)
            }
            .padding(.horizontal, 14)
            .padding(.vertical, 8)
            .background(isSelected ? AnyShapeStyle(AppConstants.accentGradient) : AnyShapeStyle(AppConstants.surfaceColor))
            .foregroundColor(isSelected ? .white : AppConstants.textSecondary)
            .clipShape(Capsule())
        }
    }
}
