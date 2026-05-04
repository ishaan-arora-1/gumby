import SwiftUI

enum NavigationDestination: Hashable {
    case chat
    case explore
    case calendar
    case history
}

struct SidebarView: View {
    @EnvironmentObject var sidebarVM: SidebarViewModel
    @EnvironmentObject var authService: AuthService
    @EnvironmentObject var chatVM: ChatViewModel
    @Binding var selectedDestination: NavigationDestination
    
    var body: some View {
        ZStack(alignment: .leading) {
            if sidebarVM.isOpen {
                Color.black.opacity(0.5)
                    .ignoresSafeArea()
                    .onTapGesture {
                        sidebarVM.close()
                    }
                
                sidebarContent
                    .frame(width: UIScreen.main.bounds.width * AppConstants.sidebarWidthRatio)
                    .transition(.move(edge: .leading))
            }
        }
        .animation(.easeInOut(duration: 0.3), value: sidebarVM.isOpen)
    }
    
    private var sidebarContent: some View {
        VStack(alignment: .leading, spacing: 0) {
            headerSection
            
            Divider()
                .background(AppConstants.textSecondary.opacity(0.3))
            
            menuItems
            
            Spacer()
            
            signOutButton
        }
        .frame(maxHeight: .infinity)
        .background(AppConstants.surfaceColor)
    }
    
    private var headerSection: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(spacing: 12) {
                Text("GUMBY")
                    .font(.system(size: 24, weight: .black))
                    .foregroundStyle(AppConstants.accentGradient)
                
                Text("AI")
                    .font(.system(size: 20, weight: .bold))
                    .foregroundColor(AppConstants.textPrimary)
                
                Spacer()
            }
            
            if let user = authService.currentUser {
                HStack(spacing: 10) {
                    if let avatarURL = user.avatarURL, let url = URL(string: avatarURL) {
                        AsyncImage(url: url) { image in
                            image.resizable().scaledToFill()
                        } placeholder: {
                            Circle().fill(AppConstants.surfaceColor)
                        }
                        .frame(width: 40, height: 40)
                        .clipShape(Circle())
                    } else {
                        Circle()
                            .fill(AppConstants.accentGradient)
                            .frame(width: 40, height: 40)
                            .overlay(
                                Text(String(user.name.prefix(1)).uppercased())
                                    .font(.headline)
                                    .foregroundColor(.white)
                            )
                    }
                    
                    VStack(alignment: .leading, spacing: 2) {
                        Text(user.name)
                            .font(.subheadline)
                            .fontWeight(.semibold)
                            .foregroundColor(AppConstants.textPrimary)

                        if let email = user.email, !email.isEmpty {
                            Text(email)
                                .font(.caption)
                                .foregroundColor(AppConstants.textSecondary)
                        }
                    }
                }
            }
        }
        .padding(20)
    }
    
    private var menuItems: some View {
        VStack(spacing: 4) {
            SidebarMenuItem(
                icon: "square.and.pencil",
                title: "New chat",
                isSelected: false
            ) {
                chatVM.newConversation()
                selectedDestination = .chat
                sidebarVM.close()
            }

            SidebarMenuItem(
                icon: "bubble.left.and.bubble.right",
                title: "Chat",
                isSelected: selectedDestination == .chat
            ) {
                selectedDestination = .chat
                sidebarVM.close()
            }
            
            SidebarMenuItem(
                icon: "sparkles",
                title: "Explore",
                isSelected: selectedDestination == .explore
            ) {
                selectedDestination = .explore
                sidebarVM.close()
            }
            
            SidebarMenuItem(
                icon: "calendar",
                title: "Calendar",
                isSelected: selectedDestination == .calendar
            ) {
                selectedDestination = .calendar
                sidebarVM.close()
            }
            
            SidebarMenuItem(
                icon: "clock.arrow.circlepath",
                title: "History",
                isSelected: selectedDestination == .history
            ) {
                selectedDestination = .history
                sidebarVM.close()
            }
        }
        .padding(.vertical, 8)
    }
    
    private var signOutButton: some View {
        Button(action: {
            authService.signOut()
            sidebarVM.close()
        }) {
            HStack(spacing: 12) {
                Image(systemName: "rectangle.portrait.and.arrow.right")
                    .font(.title3)
                Text("Sign Out")
                    .font(.subheadline)
                    .fontWeight(.medium)
            }
            .foregroundColor(.red.opacity(0.8))
            .padding(.horizontal, 20)
            .padding(.vertical, 16)
        }
    }
}

struct SidebarMenuItem: View {
    let icon: String
    let title: String
    let isSelected: Bool
    let action: () -> Void
    
    var body: some View {
        Button(action: action) {
            HStack(spacing: 14) {
                Image(systemName: icon)
                    .font(.title3)
                    .frame(width: 24)
                
                Text(title)
                    .font(.subheadline)
                    .fontWeight(.medium)
                
                Spacer()
            }
            .foregroundColor(isSelected ? AppConstants.textPrimary : AppConstants.textSecondary)
            .padding(.horizontal, 20)
            .padding(.vertical, 12)
            .background(
                isSelected ? AppConstants.backgroundColor.opacity(0.5) : Color.clear
            )
            .clipShape(RoundedRectangle(cornerRadius: 10))
            .padding(.horizontal, 8)
        }
    }
}
