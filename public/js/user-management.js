let currentPage = 1;
const recordsPerPage = 10;
let filterTimeout = null;

async function fetchFilteredUsers(params) {
    try {
        const response = await fetch(`/admin/users/filter?${params.toString()}`, {
            headers: {
                'Accept': 'application/json',
                'X-Requested-With': 'XMLHttpRequest'
            }
        });
        
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        return await response.json();
    } catch (error) {
        console.error('Error fetching users:', error);
        return null;
    }
}

function updateUserTable(users) {
    const tbody = document.getElementById('userTableBody');
    if (!tbody) return;

    if (!users || users.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="5" class="p-4 text-center text-gray-400">
                    No users found matching the criteria
                </td>
            </tr>
        `;
        return;
    }

    tbody.innerHTML = users.map(user => `
        <tr class="hover:bg-gray-700/50">
            <td class="p-4">
                <div class="flex items-center space-x-3">
                    <div class="w-8 h-8 bg-blue-600 rounded-full flex items-center justify-center">
                        ${user.username.charAt(0).toUpperCase()}
                    </div>
                    <span>${user.username}</span>
                </div>
            </td>
            <td class="p-4">
                <span class="px-3 py-1 rounded-full text-sm ${
                    user.role === 'Admin' ? 'bg-red-500/20 text-red-400' :
                    user.role === 'Moderator' ? 'bg-yellow-500/20 text-yellow-400' :
                    'bg-blue-500/20 text-blue-400'
                }">${user.role}</span>
            </td>
            <td class="p-4 text-gray-400">${user.createdAt}</td>
            <td class="p-4">
                <span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-500/20 text-green-400">
                    Active
                </span>
            </td>
            <td class="p-4">
                <div class="flex space-x-2">
                    <button onclick="openEditUserModal('${user._id}', '${user.username}', '${user.role}')"
                            class="text-yellow-400 hover:text-yellow-300">
                        Edit
                    </button>
                    ${user.role !== 'Admin' ? `
                        <button onclick="deleteUser('${user._id}')"
                                class="text-red-400 hover:text-red-300">
                            Delete
                        </button>
                    ` : ''}
                </div>
            </td>
        </tr>
    `).join('');
}

function updatePagination(pagination) {
    if (!pagination) return;
    
    document.getElementById('startRecord').textContent = pagination.start;
    document.getElementById('endRecord').textContent = pagination.end;
    document.getElementById('totalRecords').textContent = pagination.total;
    
    const prevButton = document.querySelector('button[onclick="previousPage()"]');
    const nextButton = document.querySelector('button[onclick="nextPage()"]');
    
    if (prevButton) prevButton.disabled = pagination.current === 1;
    if (nextButton) nextButton.disabled = pagination.current >= pagination.pages;
}

// Add clear filter functionality
function clearFilters() {
    const filterForm = document.getElementById('usersFilterForm');
    if (!filterForm) return;

    // Reset all form inputs
    filterForm.querySelectorAll('input, select').forEach(element => {
        if (element.type === 'date') {
            element.value = '';
        } else if (element.type === 'text') {
            element.value = '';
        } else if (element.tagName === 'SELECT') {
            element.selectedIndex = 0;
        }
    });

    // Reset pagination
    currentPage = 1;

    // Reload users with cleared filters
    loadUsers();
}

// Add date validation function
function validateDates() {
    const startDate = document.querySelector('input[name="startDate"]');
    const endDate = document.querySelector('input[name="endDate"]');
    
    if (!startDate || !endDate) return;

    // Set max date to today
    const today = new Date().toISOString().split('T')[0];
    startDate.max = today;
    endDate.max = today;

    // Ensure end date is not before start date
    startDate.addEventListener('change', () => {
        endDate.min = startDate.value;
        if (endDate.value && endDate.value < startDate.value) {
            endDate.value = startDate.value;
        }
    });

    // Ensure start date is not after end date
    endDate.addEventListener('change', () => {
        startDate.max = endDate.value || today;
        if (startDate.value && startDate.value > endDate.value) {
            startDate.value = endDate.value;
        }
    });
}

// Add modal control functions
function openAddUserModal() {
    document.getElementById('addUserModal').classList.remove('hidden');
}

function closeAddUserModal() {
    document.getElementById('addUserModal').classList.add('hidden');
}

// Load users on page load and setup live filtering
document.addEventListener('DOMContentLoaded', () => {
    const filterForm = document.getElementById('usersFilterForm');
    if (!filterForm) return;

    // Initialize date validation
    validateDates();

    // Initial load
    loadUsers();

    // Setup live filtering
    filterForm.querySelectorAll('input, select').forEach(element => {
        element.addEventListener('input', () => {
            clearTimeout(filterTimeout);
            filterTimeout = setTimeout(() => {
                currentPage = 1;
                loadUsers();
            }, 300); // Debounce for 300ms
        });
    });

    // Prevent form submission
    filterForm.addEventListener('submit', (e) => {
        e.preventDefault();
    });

    // Add user form handling
    const addUserForm = document.querySelector('#addUserModal form');
    if (addUserForm) {
        addUserForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            
            const formData = new FormData(addUserForm);
            const data = {
                username: formData.get('username'),
                password: formData.get('password'),
                role: formData.get('role'),
                email: formData.get('email'),
                bio: formData.get('bio')
            };

            try {
                const response = await fetch('/admin/users', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'X-Requested-With': 'XMLHttpRequest'
                    },
                    body: JSON.stringify(data)
                });

                const result = await response.json();
                if (result.success) {
                    closeAddUserModal();
                    addUserForm.reset();
                    loadUsers();
                } else {
                    alert(result.error || 'Failed to create user');
                }
            } catch (error) {
                console.error('Error creating user:', error);
                alert('Error creating user');
            }
        });
    }

    // Update the edit form handling
    const editForm = document.getElementById('editUserForm');
    if (editForm) {
        editForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const formData = new FormData(editForm);
            const userId = document.getElementById('editUserId').value;

            // Create update data object
            const updateData = {};
            if (formData.get('username')) updateData.username = formData.get('username');
            if (formData.get('password')) updateData.password = formData.get('password');
            if (formData.get('role')) updateData.role = formData.get('role');

            try {
                const response = await fetch(`/admin/users/${userId}/update`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'X-Requested-With': 'XMLHttpRequest'
                    },
                    body: JSON.stringify(updateData)
                });

                const data = await response.json();
                if (data.success) {
                    closeEditUserModal();
                    loadUsers();
                } else {
                    alert(data.error || 'Failed to update user');
                }
            } catch (error) {
                console.error('Error updating user:', error);
                alert('Error updating user');
            }
        });
    }
});

async function loadUsers() {
    const filterForm = document.getElementById('usersFilterForm');
    if (!filterForm) return;

    // Show loading state
    document.getElementById('userTableBody').innerHTML = `
        <tr>
            <td colspan="5" class="p-4 text-center text-gray-400">
                <div class="flex justify-center items-center space-x-2">
                    <svg class="animate-spin h-5 w-5 text-blue-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                        <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                        <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    <span>Loading users...</span>
                </div>
            </td>
        </tr>
    `;

    const formData = new FormData(filterForm);
    const params = new URLSearchParams(formData);
    params.set('page', currentPage.toString());

    const data = await fetchFilteredUsers(params);
    if (data?.success) {
        updateUserTable(data.users);
        updatePagination(data.pagination);
    }
}

async function previousPage() {
    if (currentPage > 1) {
        currentPage--;
        await loadUsers();
    }
}

async function nextPage() {
    currentPage++;
    await loadUsers();
}

function deleteUser(userId) {
    if (!confirm('Are you sure you want to delete this user?')) {
        return;
    }

    fetch(`/admin/users/${userId}/delete`, {
        method: 'POST',
        headers: {
            'X-Requested-With': 'XMLHttpRequest',
            'Content-Type': 'application/json'
        }
    })
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            loadUsers(); // Refresh the user list
        } else {
            alert(data.error || 'Failed to delete user');
        }
    })
    .catch(error => {
        console.error('Error:', error);
        alert('Error deleting user');
    });
}

function openEditUserModal(userId, username, role) {
    document.getElementById('editUserId').value = userId;
    document.getElementById('editUsername').value = username;
    document.getElementById('editRole').value = role;
    document.getElementById('editPassword').value = ''; // Clear password field
    document.getElementById('editUserModal').classList.remove('hidden');

    // Update form action
    document.getElementById('editUserForm').action = `/admin/users/${userId}/update`;
}

function closeEditUserModal() {
    document.getElementById('editUserModal').classList.add('hidden');
}