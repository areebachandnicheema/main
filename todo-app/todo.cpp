#include <iostream>
#include <vector>
#include <string>
#include <fstream>
#include <sstream>
#include <algorithm>
#include <ctime>

using namespace std;

struct Task {
    int id;
    string text;
    bool completed;
    string createdAt;
};

class TodoApp {
private:
    vector<Task> tasks;
    string filename = "tasks.txt";
    int nextId = 1;

public:
    TodoApp() {
        loadFromFile();
    }

    void displayMenu() {
        cout << "\n===== TO-DO LIST APPLICATION =====" << endl;
        cout << "1. Add Task" << endl;
        cout << "2. View All Tasks" << endl;
        cout << "3. View Active Tasks" << endl;
        cout << "4. View Completed Tasks" << endl;
        cout << "5. Mark Task as Complete" << endl;
        cout << "6. Edit Task" << endl;
        cout << "7. Delete Task" << endl;
        cout << "8. Clear Completed Tasks" << endl;
        cout << "9. Show Statistics" << endl;
        cout << "10. Exit" << endl;
        cout << "===================================" << endl;
    }

    void addTask() {
        cout << "\nEnter task description: ";
        cin.ignore();
        string text;
        getline(cin, text);

        if (text.empty()) {
            cout << "Task cannot be empty!" << endl;
            return;
        }

        Task newTask;
        newTask.id = nextId++;
        newTask.text = text;
        newTask.completed = false;
        newTask.createdAt = getCurrentTime();

        tasks.push_back(newTask);
        saveToFile();
        cout << "Task added successfully!" << endl;
    }

    void viewAllTasks() {
        if (tasks.empty()) {
            cout << "\nNo tasks found!" << endl;
            return;
        }

        cout << "\n===== ALL TASKS =====" << endl;
        displayTasks(tasks);
    }

    void viewActiveTasks() {
        vector<Task> activeTasks;
        for (const auto& task : tasks) {
            if (!task.completed) {
                activeTasks.push_back(task);
            }
        }

        if (activeTasks.empty()) {
            cout << "\nNo active tasks!" << endl;
            return;
        }

        cout << "\n===== ACTIVE TASKS =====" << endl;
        displayTasks(activeTasks);
    }

    void viewCompletedTasks() {
        vector<Task> completedTasks;
        for (const auto& task : tasks) {
            if (task.completed) {
                completedTasks.push_back(task);
            }
        }

        if (completedTasks.empty()) {
            cout << "\nNo completed tasks!" << endl;
            return;
        }

        cout << "\n===== COMPLETED TASKS =====" << endl;
        displayTasks(completedTasks);
    }

    void markTaskComplete() {
        if (tasks.empty()) {
            cout << "\nNo tasks to mark!" << endl;
            return;
        }

        viewAllTasks();
        cout << "\nEnter task ID to mark as complete: ";
        int id;
        cin >> id;

        for (auto& task : tasks) {
            if (task.id == id) {
                task.completed = true;
                saveToFile();
                cout << "Task marked as complete!" << endl;
                return;
            }
        }

        cout << "Task not found!" << endl;
    }

    void editTask() {
        if (tasks.empty()) {
            cout << "\nNo tasks to edit!" << endl;
            return;
        }

        viewAllTasks();
        cout << "\nEnter task ID to edit: ";
        int id;
        cin >> id;

        for (auto& task : tasks) {
            if (task.id == id) {
                cout << "Enter new task description: ";
                cin.ignore();
                string newText;
                getline(cin, newText);

                if (!newText.empty()) {
                    task.text = newText;
                    saveToFile();
                    cout << "Task updated successfully!" << endl;
                }
                return;
            }
        }

        cout << "Task not found!" << endl;
    }

    void deleteTask() {
        if (tasks.empty()) {
            cout << "\nNo tasks to delete!" << endl;
            return;
        }

        viewAllTasks();
        cout << "\nEnter task ID to delete: ";
        int id;
        cin >> id;

        auto it = find_if(tasks.begin(), tasks.end(),
                         [id](const Task& t) { return t.id == id; });

        if (it != tasks.end()) {
            tasks.erase(it);
            saveToFile();
            cout << "Task deleted successfully!" << endl;
        } else {
            cout << "Task not found!" << endl;
        }
    }

    void clearCompleted() {
        auto it = remove_if(tasks.begin(), tasks.end(),
                           [](const Task& t) { return t.completed; });
        tasks.erase(it, tasks.end());
        saveToFile();
        cout << "Completed tasks cleared!" << endl;
    }

    void showStatistics() {
        int total = tasks.size();
        int active = 0, completed = 0;

        for (const auto& task : tasks) {
            if (task.completed) {
                completed++;
            } else {
                active++;
            }
        }

        cout << "\n===== STATISTICS =====" << endl;
        cout << "Total Tasks: " << total << endl;
        cout << "Active Tasks: " << active << endl;
        cout << "Completed Tasks: " << completed << endl;
        if (total > 0) {
            cout << "Completion Rate: " << (completed * 100 / total) << "%" << endl;
        }
    }

    void run() {
        int choice;

        while (true) {
            displayMenu();
            cout << "Enter your choice: ";
            cin >> choice;

            switch (choice) {
                case 1:
                    addTask();
                    break;
                case 2:
                    viewAllTasks();
                    break;
                case 3:
                    viewActiveTasks();
                    break;
                case 4:
                    viewCompletedTasks();
                    break;
                case 5:
                    markTaskComplete();
                    break;
                case 6:
                    editTask();
                    break;
                case 7:
                    deleteTask();
                    break;
                case 8:
                    clearCompleted();
                    break;
                case 9:
                    showStatistics();
                    break;
                case 10:
                    cout << "Goodbye!" << endl;
                    return;
                default:
                    cout << "Invalid choice! Please try again." << endl;
            }
        }
    }

private:
    void displayTasks(const vector<Task>& taskList) {
        for (const auto& task : taskList) {
            cout << "[" << task.id << "] " 
                 << (task.completed ? "[X] " : "[ ] ")
                 << task.text << endl;
        }
    }

    string getCurrentTime() {
        time_t now = time(0);
        tm* timeinfo = localtime(&now);
        char buffer[80];
        strftime(buffer, sizeof(buffer), "%Y-%m-%d %H:%M:%S", timeinfo);
        return string(buffer);
    }

    void saveToFile() {
        ofstream file(filename);
        for (const auto& task : tasks) {
            file << task.id << "|" << task.text << "|" 
                 << (task.completed ? "1" : "0") << "|" << task.createdAt << "\n";
        }
        file.close();
    }

    void loadFromFile() {
        ifstream file(filename);
        if (!file.is_open()) return;

        string line;
        while (getline(file, line)) {
            if (line.empty()) continue;

            stringstream ss(line);
            string idStr, text, completedStr, createdAt;

            getline(ss, idStr, '|');
            getline(ss, text, '|');
            getline(ss, completedStr, '|');
            getline(ss, createdAt, '|');

            Task task;
            task.id = stoi(idStr);
            task.text = text;
            task.completed = (completedStr == "1");
            task.createdAt = createdAt;

            tasks.push_back(task);
            if (task.id >= nextId) {
                nextId = task.id + 1;
            }
        }
        file.close();
    }
};

int main() {
    TodoApp app;
    app.run();
    return 0;
}