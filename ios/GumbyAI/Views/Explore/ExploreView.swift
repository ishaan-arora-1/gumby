import SwiftUI

struct ExploreView: View {
    @EnvironmentObject var exploreVM: ExploreViewModel
    @EnvironmentObject var sidebarVM: SidebarViewModel
    @EnvironmentObject var chatVM: ChatViewModel
    @EnvironmentObject var libraryVM: LibraryViewModel
    @Binding var selectedDestination: NavigationDestination
    
    var body: some View {
        ZStack {
            AppConstants.backgroundColor.ignoresSafeArea()
            
            VStack(spacing: 0) {
                header
                tabBar
                content
            }
        }
        .sheet(isPresented: $exploreVM.showModelDetail) {
            if let model = exploreVM.selectedModel {
                ModelDetailSheet(
                    model: model,
                    onUseInChat: { useModelInChat(model) },
                    onSave: { saveModel(model) }
                )
            }
        }
        .sheet(isPresented: $exploreVM.showMoodBoardDetail) {
            if let board = exploreVM.selectedMoodBoard {
                MoodBoardDetailSheet(
                    moodBoard: board,
                    onUseInChat: { useMoodBoardInChat(board) },
                    onSave: { saveMoodBoard(board) }
                )
            }
        }
        .task {
            await exploreVM.loadModels()
            await exploreVM.loadMoodBoards()
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
            
            Text("Explore")
                .font(.headline)
                .foregroundColor(AppConstants.textPrimary)
            
            Spacer()
            
            Color.clear.frame(width: 28, height: 28)
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 12)
    }
    
    private var tabBar: some View {
        HStack(spacing: 0) {
            ForEach(ExploreViewModel.ExploreTab.allCases, id: \.self) { tab in
                Button(action: { exploreVM.selectedTab = tab }) {
                    Text(tab.rawValue)
                        .font(.subheadline)
                        .fontWeight(exploreVM.selectedTab == tab ? .semibold : .regular)
                        .foregroundColor(exploreVM.selectedTab == tab ? AppConstants.textPrimary : AppConstants.textSecondary)
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 10)
                        .overlay(alignment: .bottom) {
                            if exploreVM.selectedTab == tab {
                                Rectangle()
                                    .fill(AppConstants.accentGradient)
                                    .frame(height: 2)
                            }
                        }
                }
            }
        }
        .padding(.horizontal, 16)
    }
    
    @ViewBuilder
    private var content: some View {
        switch exploreVM.selectedTab {
        case .models:
            modelsGrid
        case .moodboards:
            moodBoardsGrid
        case .templates:
            comingSoon
        }
    }
    
    private var modelsGrid: some View {
        ScrollView {
            LazyVGrid(columns: [
                GridItem(.flexible(), spacing: 12),
                GridItem(.flexible(), spacing: 12)
            ], spacing: 12) {
                ForEach(exploreVM.models) { model in
                    ModelCard(model: model) {
                        exploreVM.selectModel(model)
                    }
                }
            }
            .padding(16)
            
            if exploreVM.isLoading {
                ProgressView().tint(.white).padding()
            }
        }
    }
    
    private var moodBoardsGrid: some View {
        ScrollView {
            LazyVGrid(columns: [
                GridItem(.flexible(), spacing: 12),
                GridItem(.flexible(), spacing: 12)
            ], spacing: 12) {
                ForEach(exploreVM.moodboards) { board in
                    MoodBoardCard(moodBoard: board) {
                        exploreVM.selectMoodBoard(board)
                    }
                }
            }
            .padding(16)
            
            if exploreVM.isLoading {
                ProgressView().tint(.white).padding()
            }
        }
    }
    
    private var comingSoon: some View {
        VStack(spacing: 16) {
            Spacer()
            Image(systemName: "sparkles")
                .font(.system(size: 48))
                .foregroundStyle(AppConstants.accentGradient)
            Text("Templates Coming Soon")
                .font(.title2)
                .fontWeight(.semibold)
                .foregroundColor(AppConstants.textPrimary)
            Text("We're working on amazing templates for you")
                .font(.subheadline)
                .foregroundColor(AppConstants.textSecondary)
            Spacer()
        }
    }
    
    private func useModelInChat(_ model: ExploreModel) {
        chatVM.attachAsset(url: model.imageURL)
        exploreVM.showModelDetail = false
        selectedDestination = .chat
    }
    
    private func useMoodBoardInChat(_ board: MoodBoard) {
        chatVM.attachAsset(url: board.coverURL)
        exploreVM.showMoodBoardDetail = false
        selectedDestination = .chat
    }
    
    private func saveModel(_ model: ExploreModel) {
        Task {
            await libraryVM.saveAsset(type: .model, id: model.id, url: model.imageURL)
        }
    }
    
    private func saveMoodBoard(_ board: MoodBoard) {
        Task {
            await libraryVM.saveAsset(type: .moodboard, id: board.id, url: board.coverURL)
        }
    }
}

struct ModelDetailSheet: View {
    let model: ExploreModel
    let onUseInChat: () -> Void
    let onSave: () -> Void
    @Environment(\.dismiss) var dismiss
    
    var body: some View {
        ZStack {
            AppConstants.backgroundColor.ignoresSafeArea()
            
            VStack(spacing: 20) {
                AsyncImage(url: URL(string: model.imageURL)) { image in
                    image.resizable().scaledToFit()
                } placeholder: {
                    RoundedRectangle(cornerRadius: AppConstants.cardCornerRadius)
                        .fill(AppConstants.surfaceColor)
                        .overlay(ProgressView().tint(.white))
                }
                .frame(maxHeight: 400)
                .clipShape(RoundedRectangle(cornerRadius: AppConstants.cardCornerRadius))
                
                VStack(spacing: 8) {
                    Text(model.name)
                        .font(.title2)
                        .fontWeight(.bold)
                        .foregroundColor(AppConstants.textPrimary)
                    
                    Text(model.pose)
                        .font(.subheadline)
                        .foregroundColor(AppConstants.textSecondary)
                    
                    if let tags = model.tags {
                        HStack {
                            ForEach(tags, id: \.self) { tag in
                                Text(tag)
                                    .font(.caption)
                                    .padding(.horizontal, 10)
                                    .padding(.vertical, 4)
                                    .background(AppConstants.surfaceColor)
                                    .foregroundColor(AppConstants.textSecondary)
                                    .clipShape(Capsule())
                            }
                        }
                    }
                }
                
                Spacer()
                
                HStack(spacing: 16) {
                    Button(action: {
                        onSave()
                        dismiss()
                    }) {
                        Label("Save to Library", systemImage: "bookmark")
                            .font(.subheadline)
                            .fontWeight(.semibold)
                            .frame(maxWidth: .infinity)
                            .padding(.vertical, 14)
                            .background(AppConstants.surfaceColor)
                            .foregroundColor(AppConstants.textPrimary)
                            .clipShape(RoundedRectangle(cornerRadius: AppConstants.buttonCornerRadius))
                    }
                    
                    Button(action: {
                        onUseInChat()
                        dismiss()
                    }) {
                        Label("Use in Chat", systemImage: "bubble.left")
                            .font(.subheadline)
                            .fontWeight(.semibold)
                            .frame(maxWidth: .infinity)
                            .padding(.vertical, 14)
                            .background(AppConstants.accentGradient)
                            .foregroundColor(.white)
                            .clipShape(RoundedRectangle(cornerRadius: AppConstants.buttonCornerRadius))
                    }
                }
            }
            .padding(20)
        }
        .presentationDetents([.large])
    }
}

struct MoodBoardDetailSheet: View {
    let moodBoard: MoodBoard
    let onUseInChat: () -> Void
    let onSave: () -> Void
    @Environment(\.dismiss) var dismiss
    
    var body: some View {
        ZStack {
            AppConstants.backgroundColor.ignoresSafeArea()
            
            VStack(spacing: 20) {
                Text(moodBoard.title)
                    .font(.title2)
                    .fontWeight(.bold)
                    .foregroundColor(AppConstants.textPrimary)
                
                ScrollView {
                    LazyVGrid(columns: [
                        GridItem(.flexible(), spacing: 8),
                        GridItem(.flexible(), spacing: 8)
                    ], spacing: 8) {
                        ForEach(moodBoard.imageURLs, id: \.self) { imageURL in
                            AsyncImage(url: URL(string: imageURL)) { image in
                                image.resizable().scaledToFill()
                            } placeholder: {
                                RoundedRectangle(cornerRadius: 8)
                                    .fill(AppConstants.surfaceColor)
                                    .overlay(ProgressView().tint(.white))
                            }
                            .frame(height: 160)
                            .clipShape(RoundedRectangle(cornerRadius: 8))
                        }
                    }
                }
                
                if let tags = moodBoard.tags {
                    HStack {
                        ForEach(tags, id: \.self) { tag in
                            Text(tag)
                                .font(.caption)
                                .padding(.horizontal, 10)
                                .padding(.vertical, 4)
                                .background(AppConstants.surfaceColor)
                                .foregroundColor(AppConstants.textSecondary)
                                .clipShape(Capsule())
                        }
                    }
                }
                
                HStack(spacing: 16) {
                    Button(action: {
                        onSave()
                        dismiss()
                    }) {
                        Label("Save to Library", systemImage: "bookmark")
                            .font(.subheadline)
                            .fontWeight(.semibold)
                            .frame(maxWidth: .infinity)
                            .padding(.vertical, 14)
                            .background(AppConstants.surfaceColor)
                            .foregroundColor(AppConstants.textPrimary)
                            .clipShape(RoundedRectangle(cornerRadius: AppConstants.buttonCornerRadius))
                    }
                    
                    Button(action: {
                        onUseInChat()
                        dismiss()
                    }) {
                        Label("Use in Chat", systemImage: "bubble.left")
                            .font(.subheadline)
                            .fontWeight(.semibold)
                            .frame(maxWidth: .infinity)
                            .padding(.vertical, 14)
                            .background(AppConstants.accentGradient)
                            .foregroundColor(.white)
                            .clipShape(RoundedRectangle(cornerRadius: AppConstants.buttonCornerRadius))
                    }
                }
            }
            .padding(20)
        }
        .presentationDetents([.large])
    }
}
